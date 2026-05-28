// ai-tutor — personalised streaming chat endpoint for the DOH exam tutor.
// Fetches the user's progress data server-side, injects it into the system
// prompt (cached static block + uncached dynamic block), then runs a real
// Anthropic streaming loop that handles tool_use calls before forwarding
// text tokens to the client over SSE. Replaces the old fake-setTimeout stream.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
const MODEL = "claude-sonnet-4-6";
const MAX_LOOPS = 4;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Static system prompt block — marked for prompt caching.
// Minimum 1024 tokens required for Anthropic cache activation;
// this block is ~1200 tokens and never changes across requests.
const STATIC_SYSTEM = `You are Dr. Tutor, a senior consultant physician and expert DOH exam coach. You help doctors from across the Middle East and South Asia pass the UAE Department of Health (DOH) licensing examination for physicians.

## About the DOH Exam
The UAE DOH licensing exam tests clinical knowledge across all major specialties. It is a 150-question multiple-choice exam (single best answer format). The exam has a 65% pass mark. Questions follow a Pearson VUE clinical vignette format: a brief clinical scenario followed by 4–5 answer options. The exam covers the following domains: Internal Medicine, Cardiology, Gastroenterology, Nephrology, Respiratory Medicine, Endocrinology, Rheumatology, Infectious Disease, Haematology, Oncology, Neurology, Psychiatry, Dermatology, Obstetrics and Gynaecology, Paediatrics, Surgery, Ophthalmology, ENT, Orthopaedics, Community Medicine, Pharmacology, and Medical Ethics.

## Your coaching responsibilities
- Answer all clinical questions with precision. Tie every management step to a specific guideline (NICE, JNC 8, UAE MOH, ADA, AHA/ACC, ESC, WHO, GINA, GOLD as appropriate). When citing a guideline, name the source explicitly.
- When the student asks to be quizzed or requests a practice question, call fetch_practice_question immediately — do not write your own question from memory.
- After receiving a question from the tool: present the question text and ALL answer options clearly (A. ... B. ... C. ... etc.), then STOP and wait for the student's answer. Do not reveal the correct answer until the student responds.
- Once the student answers: reveal whether they were correct, then explain the mechanism behind the correct answer. If they answered incorrectly, address why their chosen option was a plausible but wrong distractor. Use the explanation to anchor a memorable clinical rule.
- Proactively reference the student's weak topics when those topics are relevant to the conversation.
- Be warm, direct, and efficient — like a consultant running a focused bedside teaching session. Avoid excessive padding.
- Keep responses to 2–4 short paragraphs unless the topic genuinely demands more depth.
- Use **bold** for drug names, key lab values, diagnostic criteria, important numerical thresholds, and guideline names.
- If unsure of a specific dose, threshold, or country-specific protocol, say "verify in current guidelines" rather than guessing. Hallucinations on a medical platform are unacceptable.
- For mnemonics or memory aids, offer them proactively when they help retention.

## High-yield clinical principles
- ECG interpretation: identify rate, rhythm, axis, intervals (PR, QRS, QT), and ST/T wave changes systematically before giving a diagnosis.
- Chest X-ray: comment on technical quality, then work systematically (trachea, hila, lung fields, heart borders, diaphragm, costophrenic angles, mediastinum, bones).
- Drug prescribing for UAE practice: use BNF/NICE or ESC/AHA guidelines; note UAE-specific formulary differences when relevant.
- Statistical concepts tested frequently: sensitivity, specificity, PPV, NPV, NNT, NNH, relative risk, odds ratio, p-value, confidence intervals, number needed to screen. Always explain which statistic is appropriate for the clinical question being asked.
- Ethics questions: anchor to the four principles (autonomy, beneficence, non-maleficence, justice) plus UAE-specific consent law. In UAE, family involvement in consent decisions is culturally and legally significant.

## Response quality standards
- Never start a response with "Great question!" or similar filler phrases.
- Do not write lengthy preambles — lead with the clinical answer.
- When presenting multiple steps (e.g., management ladder, diagnostic criteria), use a numbered list for clarity.
- After a correct student answer, briefly confirm and add one high-yield fact they might not know.
- After an incorrect student answer, be empathetic but immediately and clearly correct the misconception.
- When quoting numbers (e.g., HbA1c targets, BP thresholds, drug doses), always give the source guideline.`;

// Tools definition — cache_control on the last (only) tool marks the tools
// prefix for caching. Combined with the static system block this exceeds the
// 1024-token cache activation threshold.
const TOOLS = [
  {
    name: "fetch_practice_question",
    description:
      "Fetch a real practice question from the DOH exam question bank on a specific topic. " +
      "Call this whenever the student asks to be quizzed, requests a practice question, or uses phrases like 'quiz me', 'give me a question', 'test me on', 'practice question'.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "Medical topic to fetch a question about, e.g. 'Cardiology', 'Hypertension', 'Diabetes', 'Respiratory'.",
        },
        track: {
          type: "string",
          enum: ["specialist", "gp"],
          description:
            "Question track: 'specialist' for Internal Medicine Specialist, 'gp' for General Practice.",
        },
      },
      required: ["topic", "track"],
    },
    cache_control: { type: "ephemeral" },
  },
];

type SvcClient = ReturnType<typeof createClient>;

function primaryTopic(topic: string): string {
  if (!topic) return "Unknown";
  return topic.split(/\/|,/)[0].trim();
}

async function fetchPracticeQuestion(
  topic: string,
  track: string,
  svc: SvcClient
): Promise<string> {
  const table =
    track === "gp" ? "gp_questions" : "specialist_questions";

  const { data: topicMatch } = await svc
    .from(table)
    .select("q, options, answer, explanation, topic, subtopic")
    .ilike("topic", `%${topic}%`)
    .eq("is_active", true)
    .limit(30);

  let pool = topicMatch ?? [];

  if (pool.length === 0) {
    const { data: fallback } = await svc
      .from(table)
      .select("q, options, answer, explanation, topic, subtopic")
      .eq("is_active", true)
      .limit(10);
    pool = fallback ?? [];
  }

  if (pool.length === 0) {
    return `No questions found for topic "${topic}" in the ${track} question bank.`;
  }

  const q = pool[Math.floor(Math.random() * pool.length)];
  const opts = (q.options as string[])
    .map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o}`)
    .join("\n");

  return (
    `**Topic:** ${q.topic}${q.subtopic ? ` / ${q.subtopic}` : ""}\n\n` +
    `${q.q}\n\n${opts}\n\n` +
    `[ANSWER: ${q.answer}]\n` +
    `[EXPLANATION: ${q.explanation}]`
  );
}

async function buildUserContext(
  userId: string,
  svc: SvcClient
): Promise<string> {
  const [progressRes, dueRes] = await Promise.all([
    svc
      .from("user_progress")
      .select("topic, track, is_correct")
      .eq("user_id", userId),
    svc
      .from("flashcard_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_date", new Date().toISOString()),
  ]);

  const rows = progressRes.data ?? [];
  const dueCount = dueRes.count ?? 0;

  const acc: Record<string, { correct: number; total: number; track: string }> =
    {};
  for (const row of rows) {
    const t = primaryTopic(row.topic ?? "");
    if (!acc[t]) acc[t] = { correct: 0, total: 0, track: row.track };
    acc[t].total++;
    if (row.is_correct) acc[t].correct++;
  }

  const topicStats = Object.entries(acc)
    .filter(([, v]) => v.total >= 3)
    .map(([topic, v]) => ({
      topic,
      track: v.track,
      pct: Math.round((v.correct / v.total) * 100),
      total: v.total,
    }))
    .sort((a, b) => a.pct - b.pct);

  const weak = topicStats.filter((t) => t.pct < 75).slice(0, 6);
  const strong = topicStats.filter((t) => t.pct >= 85).slice(-3).reverse();

  const totalAnswered = rows.length;
  const totalCorrect = rows.filter((r) => r.is_correct).length;
  const overallPct =
    totalAnswered > 0
      ? Math.round((totalCorrect / totalAnswered) * 100)
      : null;

  const lines: string[] = [];

  if (totalAnswered === 0) {
    lines.push("This student has not answered any questions yet.");
  } else {
    lines.push(`Total questions answered: ${totalAnswered}`);
    if (overallPct !== null) lines.push(`Overall accuracy: ${overallPct}%`);
  }

  if (dueCount > 0) lines.push(`Flashcards due for review right now: ${dueCount}`);

  if (weak.length > 0) {
    lines.push("\nTopics needing attention (< 75% accuracy):");
    for (const t of weak) {
      lines.push(
        `  • ${t.topic}: ${t.pct}% correct across ${t.total} questions (${t.track} track)`
      );
    }
  }

  if (strong.length > 0) {
    lines.push("\nStrong areas (≥ 85% accuracy):");
    for (const t of strong) {
      lines.push(`  • ${t.topic}: ${t.pct}%`);
    }
  }

  return lines.join("\n");
}

// Parse Anthropic's SSE stream, yielding each parsed data event object.
// Anthropic streams lines like "data: {...json...}" separated by blank lines.
// We ignore "event:" lines since the type field inside data is authoritative.
async function* parseAnthropicStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        yield JSON.parse(raw) as Record<string, unknown>;
      } catch { /* skip malformed frames */ }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // In-function auth — gateway verify_jwt = false per project convention
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await anonClient.auth.getUser();

  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: {
    messages: { role: string; content: string }[];
    track?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { messages, track = "specialist" } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const svc = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);
  const userContext = await buildUserContext(user.id, svc);

  // Split system into cached static block + uncached dynamic block.
  // cache_control on the static block tells Anthropic to cache everything up
  // to and including that block. Dynamic user context follows uncached.
  const systemBlocks = [
    {
      type: "text",
      text:
        STATIC_SYSTEM +
        `\n\nPrimary track focus for this session: ${
          track === "gp"
            ? "General Practice (GP)"
            : "Internal Medicine Specialist"
        }`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `## This student's current performance\n${userContext}`,
    },
  ];

  // deno-lint-ignore no-explicit-any
  const apiMessages: any[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj: unknown) =>
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        for (let loop = 0; loop < MAX_LOOPS; loop++) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "prompt-caching-2024-07-31",
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 1200,
              system: systemBlocks,
              tools: TOOLS,
              messages: apiMessages,
              stream: true,
            }),
          });

          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => "");
            send({
              type: "error",
              message: `Claude error ${res.status}: ${errText.slice(0, 200)}`,
            });
            ctrl.close();
            return;
          }

          // Content blocks accumulated per stream iteration for tool_use reconstruction
          // deno-lint-ignore no-explicit-any
          const contentBlocks: any[] = [];
          let stopReason: string | null = null;

          for await (const event of parseAnthropicStream(
            res.body.getReader()
          )) {
            if (event.type === "content_block_start") {
              // deno-lint-ignore no-explicit-any
              const cb = event.content_block as any;
              contentBlocks[event.index as number] = {
                ...cb,
                _json: "",
              };
            }

            if (event.type === "content_block_delta") {
              // deno-lint-ignore no-explicit-any
              const delta = event.delta as any;
              const block = contentBlocks[event.index as number];

              if (delta.type === "text_delta") {
                const text = delta.text as string;
                if (block) block.text = (block.text ?? "") + text;
                // Forward text token immediately — this is the real streaming benefit
                send({ type: "delta", text });
              } else if (delta.type === "input_json_delta") {
                if (block) block._json = (block._json ?? "") + delta.partial_json;
              }
            }

            if (event.type === "content_block_stop") {
              const block = contentBlocks[event.index as number];
              if (block?.type === "tool_use" && block._json) {
                try {
                  block.input = JSON.parse(block._json);
                } catch {
                  block.input = {};
                }
              }
            }

            if (event.type === "message_delta") {
              // deno-lint-ignore no-explicit-any
              const delta = event.delta as any;
              stopReason = delta.stop_reason as string;
            }
          }

          if (stopReason === "end_turn") break;

          if (stopReason === "tool_use") {
            // deno-lint-ignore no-explicit-any
            const toolBlocks = contentBlocks.filter((b: any) => b?.type === "tool_use");

            // Reconstruct assistant message with both text and tool_use blocks
            apiMessages.push({
              role: "assistant",
              content: contentBlocks
                .filter(Boolean)
                // deno-lint-ignore no-explicit-any
                .map((b: any) => {
                  if (b.type === "tool_use") {
                    return {
                      type: "tool_use",
                      id: b.id,
                      name: b.name,
                      input: b.input ?? {},
                    };
                  }
                  return { type: "text", text: b.text ?? "" };
                }),
            });

            // Execute tools and collect results
            // deno-lint-ignore no-explicit-any
            const results: any[] = [];
            for (const tb of toolBlocks) {
              let result = "";
              if (tb.name === "fetch_practice_question") {
                result = await fetchPracticeQuestion(
                  tb.input?.topic ?? "",
                  tb.input?.track ?? track,
                  svc
                );
              } else {
                result = `Unknown tool: ${tb.name}`;
              }
              results.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: result,
              });
            }

            apiMessages.push({ role: "user", content: results });
          }
        }
      } catch (err) {
        send({ type: "error", message: String(err) });
      }

      send({ type: "done" });
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
