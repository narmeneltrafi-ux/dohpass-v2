// ai-tutor — personalised chat endpoint for the DOH exam tutor.
// Fetches the user's progress data server-side, injects it into the system
// prompt, then runs a tool-use loop that can pull real exam questions from
// the question bank. Final response is fake-streamed over SSE.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
const MODEL = "claude-sonnet-4-6";
const MAX_LOOPS = 4;

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.dohpass.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

function primaryTopic(topic: string): string {
  if (!topic) return "Unknown";
  return topic.split(/\/|,/)[0].trim();
}

// deno-lint-ignore no-explicit-any
type SvcClient = ReturnType<typeof createClient>;

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
  },
];

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

  // Aggregate by normalised topic
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

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

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
      headers: { ...cors, "Content-Type": "application/json" },
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
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { messages, track = "specialist" } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const svc = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);
  const userContext = await buildUserContext(user.id, svc);

  const systemPrompt = `You are Dr. Tutor, a senior consultant physician and expert DOH exam coach. You help doctors pass the UAE Department of Health licensing exam.

## This student's current performance
${userContext}

## Coaching rules
- Answer clinical questions with precision; tie every management step to a specific guideline (NICE, JNC 8, UAE MOH, ADA, ESC as appropriate)
- When the student asks to be quizzed or requests a practice question, call fetch_practice_question immediately — do not write your own question
- After receiving a question from the tool: present the question text and ALL answer options clearly, then STOP — do not reveal the answer yet. Wait for the student's response before showing the correct answer and explanation
- Proactively reference the student's weak topics when those topics are relevant to the conversation
- Be warm, direct, and efficient — like a consultant running a focused bedside teaching session
- Keep responses to 2–4 paragraphs unless the topic genuinely demands depth
- Use **bold** for drug names, key values, diagnostic criteria, and guidelines
- If unsure of a specific dose or threshold, say "verify in current guidelines" rather than guessing
- Primary track focus for this session: ${track === "gp" ? "General Practice (GP)" : "Internal Medicine Specialist"}`;

  // deno-lint-ignore no-explicit-any
  const apiMessages: any[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let finalText = "";

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: systemPrompt,
        tools: TOOLS,
        messages: apiMessages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: `Claude error ${res.status}: ${errText.slice(0, 200)}`,
        }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // deno-lint-ignore no-explicit-any
    const data: any = await res.json();

    if (data.stop_reason === "tool_use") {
      // deno-lint-ignore no-explicit-any
      const toolBlocks = data.content.filter((b: any) => b.type === "tool_use");
      apiMessages.push({ role: "assistant", content: data.content });

      // deno-lint-ignore no-explicit-any
      const results: any[] = [];
      for (const tb of toolBlocks) {
        let result = "";
        if (tb.name === "fetch_practice_question") {
          result = await fetchPracticeQuestion(
            tb.input.topic ?? "",
            tb.input.track ?? track,
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
      continue;
    }

    // deno-lint-ignore no-explicit-any
    finalText = (data.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    break;
  }

  // Fake-stream the final text as SSE: 4 chars every 12 ms
  const enc = new TextEncoder();
  const CHUNK = 4;
  const DELAY_MS = 12;

  const stream = new ReadableStream({
    async start(ctrl) {
      for (let i = 0; i < finalText.length; i += CHUNK) {
        ctrl.enqueue(
          enc.encode(
            `data: ${JSON.stringify({
              type: "delta",
              text: finalText.slice(i, i + CHUNK),
            })}\n\n`
          )
        );
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
      ctrl.enqueue(
        enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
      );
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
