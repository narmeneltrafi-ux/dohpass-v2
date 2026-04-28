import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const FUNCTION_NAME = "review-questions";
const BATCH_SIZE = 50;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function log(status: string, message: string) {
  await supabase.from("function_logs").insert({
    function_name: FUNCTION_NAME,
    status,
    message,
  });
}

type ClaudeOk = { ok: true; data: any };
type ClaudeErr = {
  ok: false;
  errorType: string;
  status: number | null;
  requestId: string | null;
  message: string;
  attempts: number;
};

async function callClaude(prompt: string): Promise<ClaudeOk | ClaudeErr> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        continue;
      }
      return { ok: false, errorType: "network_error", status: null, requestId: null, message: String(err), attempts: attempt };
    }

    const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id");

    if ((res.status === 429 || res.status === 529) && attempt < maxAttempts) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "");
      const backoffMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let errorType = `http_${res.status}`;
      let message = body.slice(0, 200);
      try {
        const parsed = JSON.parse(body);
        errorType = parsed?.error?.type ?? errorType;
        message = parsed?.error?.message ?? message;
      } catch { /* leave raw */ }
      return { ok: false, errorType, status: res.status, requestId, message, attempts: attempt };
    }

    const body = await res.json().catch(() => null);
    const text = body?.content?.[0]?.text;
    if (typeof text !== "string") {
      return {
        ok: false,
        errorType: "malformed_response",
        status: res.status,
        requestId,
        message: JSON.stringify(body ?? {}).slice(0, 200),
        attempts: attempt,
      };
    }

    // Strip markdown fences before parsing — Claude sometimes wraps JSON in ```json ... ```
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```json?/g, "").replace(/```/g, "").trim();
    }

    try {
      return { ok: true, data: JSON.parse(cleaned) };
    } catch (err) {
      return { ok: false, errorType: "json_parse_error", status: res.status, requestId, message: String(err), attempts: attempt };
    }
  }
  return { ok: false, errorType: "retries_exhausted", status: null, requestId: null, message: "", attempts: maxAttempts };
}

type ReviewOutcome =
  | { status: "ok"; updated: boolean; flagged: boolean }
  | { status: "error"; errorType: string; requestId: string | null; attempts: number };

async function reviewQuestion(q: any, table: string): Promise<ReviewOutcome> {
  const prompt = `You are a senior medical educator reviewing exam questions for the UAE DOH licensing exam.

Review this question and return a corrected version if needed:

Question: ${q.q}
Options: ${JSON.stringify(q.options)}
Answer: ${q.answer}
Explanation: ${q.explanation}

Check for:
1. Duplicate or poorly worded question text
2. Grammatical errors in question or options
3. Poor or incomplete explanation
4. Whether the answer MIGHT be wrong (flag only, do not change)

Respond ONLY with a valid JSON object, no preamble, no markdown:
{
  "q": "corrected question text (or same if fine)",
  "options": ["corrected options (or same if fine)"],
  "explanation": "corrected explanation (or same if fine)",
  "answer_flagged": true or false,
  "answer_flag_reason": "reason if flagged, otherwise null",
  "changes_made": true or false
}`;

  const claude = await callClaude(prompt);

  if (!claude.ok) {
    await log("error", JSON.stringify({
      table,
      questionId: q.id,
      errorType: claude.errorType,
      status: claude.status,
      requestId: claude.requestId,
      attempts: claude.attempts,
      message: claude.message,
    }));
    return { status: "error", errorType: claude.errorType, requestId: claude.requestId, attempts: claude.attempts };
  }

  const result = claude.data;
  if (!result.changes_made && !result.answer_flagged) {
    return { status: "ok", updated: false, flagged: false };
  }

  const update: any = {};

  if (result.changes_made) {
    update.q = result.q;
    update.options = result.options;
    update.explanation = result.explanation;
  }

  if (result.answer_flagged) {
    update.needs_review = true;
    update.review_reason = result.answer_flag_reason;
  }

  const { error } = await supabase
    .from(table)
    .update(update)
    .eq("id", q.id);

  if (error) {
    await log("error", JSON.stringify({ table, questionId: q.id, errorType: "db_update_error", message: error.message }));
    return { status: "error", errorType: "db_update_error", requestId: null, attempts: 0 };
  }

  await log("success", `Updated id ${q.id} in ${table} — flagged: ${result.answer_flagged}`);
  return { status: "ok", updated: result.changes_made, flagged: result.answer_flagged };
}

serve(async (req) => {
  // ---------- RATE LIMIT: once per 24h ----------
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("function_logs")
    .select("created_at")
    .eq("function_name", FUNCTION_NAME)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recent && recent.length > 0) {
    await log("rate_limited", `Skipped: last run at ${recent[0].created_at}`);
    return new Response(
      JSON.stringify({
        success: false,
        rateLimited: true,
        message: `${FUNCTION_NAME} already ran in last 24h`,
        lastRun: recent[0].created_at,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }
  // ---------------------------------------------

  await log("started", `Review function triggered (batch_size=${BATCH_SIZE})`);
  const outcomes: Array<{ table: string; questionId: any; status: "ok" | "error"; errorType?: string }> = [];

  try {
    const tables = ["specialist_questions", "gp_questions"];

    for (const table of tables) {
      const { data: questions, error } = await supabase
        .from(table)
        .select("id, q, options, answer, explanation")
        .is("needs_review", null)
        .limit(BATCH_SIZE);

      if (error) {
        await log("error", JSON.stringify({ table, errorType: "db_fetch_error", message: error.message }));
        outcomes.push({ table, questionId: null, status: "error", errorType: "db_fetch_error" });
        continue;
      }

      for (const q of questions || []) {
        const outcome = await reviewQuestion(q, table);
        outcomes.push({
          table,
          questionId: q.id,
          status: outcome.status,
          errorType: outcome.status === "error" ? outcome.errorType : undefined,
        });
      }

      await log("batch_done", `Processed ${questions?.length || 0} questions from ${table}`);
    }

    const reviewed = outcomes.filter((o) => o.status === "ok").length;
    const failed = outcomes.length - reviewed;
    const errorTypes = [...new Set(outcomes.filter((o) => o.status === "error" && o.errorType).map((o) => o.errorType!))];
    const apiOutage = failed > 0 && reviewed === 0;

    const summary = apiOutage
      ? `0 questions reviewed due to API error (${errorTypes.join(", ") || "unknown"})`
      : `${reviewed}/${outcomes.length} questions reviewed`;

    await log("completed", summary);

    return new Response(
      JSON.stringify({
        success: failed === 0,
        reviewed,
        failed,
        errorTypes,
        summary,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    await log("error", JSON.stringify({ errorType: "top_level_crash", message: String(err) }));
    return new Response(
      JSON.stringify({ success: false, reviewed: 0, summary: "0 questions reviewed due to top-level crash", error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
