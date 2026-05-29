// ai-tutor v2 — DOH exam tutor + study coach
// Changes from v1:
//   - hasAccess gate (access_expires_at check) before any Anthropic call
//   - Rate limit: 20 req/user/day via ai_requests table
//   - CORS driven by ALLOWED_ORIGINS env (comma-separated, falls back to https://www.dohpass.com)
//   - Prompt caching on system prompt (ephemeral)
//   - mode:'coach' → JSON response with 3-bullet daily plan
//   - questionId → inject question stem+explanation as cached context

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";

const MODEL = "claude-sonnet-4-6";
const MAX_LOOPS = 4;
const DAILY_LIMIT = 20;

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

// deno-lint-ignore no-explicit-any
type SvcClient = ReturnType<typeof createClient>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function primaryTopic(topic: string): string {
  if (!topic) return "Unknown";
  return topic.split(/\/|,/)[0].trim();
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ─── Access gate ────────────────────────────────────────────────────────────

async function checkAccess(userId: string, svc: SvcClient): Promise<boolean> {
  const { data: profile } = await svc
    .from("profiles")
    .select("access_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.access_expires_at) return false;
  return new Date(profile.access_expires_at) > new Date();
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

// Returns remaining requests after increment, or -1 if limit exceeded.
async function checkAndIncrementRate(
  userId: string,
  svc: SvcClient
): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await svc
    .from("ai_requests")
    .select("count")
    .eq("user_id", userId)
    .eq("request_date", today)
    .maybeSingle();

  const current = existing?.count ?? 0;
  if (current >= DAILY_LIMIT) return -1;

  await svc
    .from("ai_requests")
    .upsert(
      { user_id: userId, request_date: today, count: current + 1 },
      { onConflict: "user_id,request_date" }
    );

  return DAILY_LIMIT - (current + 1);
}

// ─── User context for system prompt ──────────────────────────────────────────

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

  if (dueCount > 0)
    lines.push(`Flashcards due for review right now: ${dueCount}`);

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

// ─── Question context (for quiz-flow tutor) ───────────────────────────────────

async function fetchQuestionContext(
  questionId: string,
  track: string,
  svc: SvcClient
): Promise<string | null> {
  const table = track === "gp" ? "gp_questions" : "specialist_questions";
  const { data: q } = await svc
    .from(table)
    .select("q, options, answer, explanation, topic, subtopic")
    .eq("id", questionId)
    .maybeSingle();

  if (!q) return null;

  const opts = (q.options as string[])
    .map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o}`)
    .join("\n");

  return (
    `## Question under discussion\n` +
    `Topic: ${q.topic}${q.subtopic ? ` / ${q.subtopic}` : ""}\n\n` +
    `${q.q}\n\n${opts}\n\n` +
    `Correct Answer: ${q.answer}\n` +
    `Explanation: ${q.explanation}`
  );
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

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
            "Medical topic to fetch a question about, e.g. 'Cardiology', 'Hypertension', 'Diabetes'.",
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
  const table = track === "gp" ? "gp_questions" : "specialist_questions";

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

// ─── Study Coach mode ─────────────────────────────────────────────────────────

async function runStudyCoach(
  userId: string,
  track: string,
  svc: SvcClient,
  cors: Record<string, string>
): Promise<Response> {
  const userContext = await buildUserContext(userId, svc);

  const prompt = `You are Dr. Tutor, a DOH exam coach. Based on this student's performance data, write a focused 3-point daily study plan.\n\n## Student performance\n${userContext}\n\n## Rules\n- Output exactly 3 bullet points, each 1–2 sentences\n- Each bullet must be specific and actionable (not generic advice)\n- Prioritise the weakest topics\n- If there's no data yet, give a sensible starting plan for a ${track === "gp" ? "GP" : "Internal Medicine Specialist"} candidate\n- Start each bullet with a bold action verb\n- Do not include any preamble or sign-off — just the 3 bullets`;

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
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: prompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "Generate my study plan." }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return jsonError(`Claude error ${res.status}: ${errText.slice(0, 200)}`, 502, cors);
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await res.json();
  const text = (data.content as { type: string; text: string }[])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Parse bullets: lines starting with - or • or **
  const bullets = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.match(/^[-•*]|\*\*/))
    .map((l) => l.replace(/^[-•*]\s*/, ""))
    .slice(0, 3);

  return new Response(
    JSON.stringify({ plan: bullets.length > 0 ? bullets : [text] }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // 1. Auth — manual check (verify_jwt=false per project convention)
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authErr,
  } = await anonClient.auth.getUser();

  if (authErr || !user) return jsonError("Unauthorized", 401, cors);

  const svc = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

  // 2. Access gate — must have active subscription
  const hasAccess = await checkAccess(user.id, svc);
  if (!hasAccess) {
    return new Response(
      JSON.stringify({
        error: "paywall",
        message:
          "AI Tutor is available to active subscribers. Upgrade to unlock personalised coaching.",
      }),
      { status: 403, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // 3. Rate limit
  const remaining = await checkAndIncrementRate(user.id, svc);
  if (remaining < 0) {
    return new Response(
      JSON.stringify({
        error: "rate_limit",
        message: `Daily limit of ${DAILY_LIMIT} AI requests reached. Resets at midnight UTC.`,
      }),
      { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // 4. Parse body
  let body: {
    mode?: "tutor" | "coach";
    messages?: { role: string; content: string }[];
    track?: string;
    questionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400, cors);
  }

  const { mode = "tutor", track = "specialist", questionId } = body;

  // 5. Study Coach mode — JSON response, no streaming
  if (mode === "coach") {
    return runStudyCoach(user.id, track, svc, cors);
  }

  // 6. Tutor mode
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError("messages array required for tutor mode", 400, cors);
  }

  // Build system prompt (cached)
  const userContext = await buildUserContext(user.id, svc);
  const questionContext = questionId
    ? await fetchQuestionContext(questionId, track, svc)
    : null;

  const systemText =
    `You are Dr. Tutor, a senior consultant physician and expert DOH exam coach. You help doctors pass the UAE Department of Health licensing exam.\n\n` +
    `## This student's current performance\n${userContext}\n\n` +
    (questionContext ? `${questionContext}\n\n` : "") +
    `## Coaching rules\n` +
    `- Answer clinical questions with precision; tie every management step to a specific guideline (NICE, JNC 8, UAE MOH, ADA, ESC as appropriate)\n` +
    `- When the student asks to be quizzed or requests a practice question, call fetch_practice_question immediately — do not write your own question\n` +
    `- After receiving a question from the tool: present the question text and ALL answer options clearly, then STOP — do not reveal the answer yet. Wait for the student's response\n` +
    `- Proactively reference the student's weak topics when those topics come up\n` +
    `- Be warm, direct, and efficient — like a consultant running a focused bedside teaching session\n` +
    `- Keep responses to 2–4 paragraphs unless the topic genuinely demands depth\n` +
    `- Use **bold** for drug names, key values, diagnostic criteria, and guidelines\n` +
    `- If unsure of a specific dose or threshold, say "verify in current guidelines" rather than guessing\n` +
    `- Primary track: ${track === "gp" ? "General Practice (GP)" : "Internal Medicine Specialist"}`;

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
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: [
          {
            type: "text",
            text: systemText,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOLS,
        messages: apiMessages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return jsonError(`Claude error ${res.status}: ${errText.slice(0, 200)}`, 502, cors);
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

  // SSE fake-stream: 4 chars / 12ms
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
        enc.encode(`data: ${JSON.stringify({ type: "done", remaining })}\n\n`)
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
