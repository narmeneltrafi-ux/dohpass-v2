import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// CRON DRAINER FOR review_queue — NOT YET DEPLOYED.
// Document only; review and deploy separately.
//
// Goal: every 15 min, claim up to 10 'pending' rows, retry the LLM review,
// flip status based on outcome.
//
// MAX_ATTEMPTS = 5. After the 5th failure the row terminates at status='failed'
// and the drainer stops retrying it (rows can be inspected manually or reaped).
//
// Pattern is the standard PG queue claim: SELECT ... FOR UPDATE SKIP LOCKED
// + atomic flip to 'in_progress' so an overlapping run can't double-process
// the same row (= duplicate LLM cost).
//
// Step 1 — schedule with pg_cron (psql, run by maintainer):
//
//   select cron.schedule(
//     'drain-review-queue',
//     '*/15 * * * *',
//     $$ select drain_review_queue(); $$
//   );
//
// Step 2 — companion fn that this function would gain a /drain entrypoint
// for, OR a sibling edge function `drain-review-queue` invoked via the
// http extension. Either way the claim SQL is:
//
//   with picked as (
//     select id, table_name, question_id
//     from review_queue
//     where status = 'pending' and attempts < 5   -- MAX_ATTEMPTS = 5
//     order by last_attempt_at nulls first
//     limit 10
//     for update skip locked
//   )
//   update review_queue rq
//      set status = 'in_progress'
//     from picked p
//    where rq.id = p.id
//   returning rq.id, rq.table_name, rq.question_id;
//
// Per-row outcome from the drainer:
//   - success:                      status='succeeded'
//   - retryable failure, attempts<5: status='pending', attempts=attempts+1,
//                                    last_error=..., last_attempt_at=now()
//   - retryable failure, attempts>=5: status='failed' (terminal — drainer
//                                    will never pick it up again)
//   - non-retryable failure:        status='failed' immediately
//
// Skipping orphans (question hard-deleted from source table):
//   left join specialist_questions sq on rq.table_name='specialist_questions' and sq.id=rq.question_id
//   left join gp_questions         gq on rq.table_name='gp_questions'         and gq.id=rq.question_id
//   where coalesce(sq.id, gq.id) is not null
// =============================================================================

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const FUNCTION_NAME = "review-questions";
const BATCH_SIZE = 50;
const CONCURRENCY = 3;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function log(status: string, message: string) {
  await supabase.from("function_logs").insert({
    function_name: FUNCTION_NAME,
    status,
    message,
  });
}

class ClaudeError extends Error {
  status: number | null;
  errorType: string;
  requestId: string | null;
  constructor(message: string, status: number | null, errorType: string, requestId: string | null) {
    super(message);
    this.status = status;
    this.errorType = errorType;
    this.requestId = requestId;
  }
}

async function callClaudeOnce(prompt: string): Promise<any> {
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
    throw new ClaudeError(String(err), null, "network_error", null);
  }

  const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id");

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let errorType = `http_${res.status}`;
    let message = body.slice(0, 200);
    try {
      const parsed = JSON.parse(body);
      errorType = parsed?.error?.type ?? errorType;
      message = parsed?.error?.message ?? message;
    } catch { /* leave raw */ }
    throw new ClaudeError(message, res.status, errorType, requestId);
  }

  const body = await res.json().catch(() => null);
  const text = body?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new ClaudeError(JSON.stringify(body ?? {}).slice(0, 200), res.status, "malformed_response", requestId);
  }

  // Strip markdown fences before parsing — Claude sometimes wraps JSON in ```json ... ```
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```json?/g, "").replace(/```/g, "").trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new ClaudeError(String(err), res.status, "json_parse_error", requestId);
  }
}

async function callWithBackoff<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.status !== 429 || i === attempts - 1) throw e;
      const base = Math.pow(4, i) * 1000; // 1s, 4s, 16s
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, base + jitter));
    }
  }
  throw new Error("unreachable");
}

async function enqueueDLQ(tableName: string, questionId: string, lastError: string): Promise<boolean> {
  // Atomic at the DB via enqueue_review_queue() — single statement, attempts
  // bumped in SQL with INSERT ... ON CONFLICT DO UPDATE SET attempts = ... + 1.
  // Avoids the read-then-upsert race when concurrency > 1.
  const { error } = await supabase.rpc("enqueue_review_queue", {
    p_table_name: tableName,
    p_question_id: questionId,
    p_last_error: lastError.slice(0, 1000),
  });

  if (error) {
    await log("error", JSON.stringify({ table: tableName, questionId, errorType: "dlq_insert_failed", message: error.message }));
    return false;
  }
  return true;
}

type ReviewOutcome =
  | { status: "ok"; updated: boolean; flagged: boolean }
  | { status: "error"; errorType: string; requestId: string | null; queued: boolean };

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

  let result: any;
  try {
    result = await callWithBackoff(() => callClaudeOnce(prompt));
  } catch (e: any) {
    const errorType = e?.errorType ?? "unknown_error";
    const message = e?.message ?? String(e);
    const requestId = e?.requestId ?? null;
    const status = e?.status ?? null;

    await log("error", JSON.stringify({ table, questionId: q.id, errorType, status, requestId, message }));
    const queued = await enqueueDLQ(table, q.id, `${errorType}: ${message}`);
    return { status: "error", errorType, requestId, queued };
  }

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

  const { error } = await supabase.from(table).update(update).eq("id", q.id);

  if (error) {
    await log("error", JSON.stringify({ table, questionId: q.id, errorType: "db_update_error", message: error.message }));
    const queued = await enqueueDLQ(table, q.id, `db_update_error: ${error.message}`);
    return { status: "error", errorType: "db_update_error", requestId: null, queued };
  }

  await log("success", `Updated id ${q.id} in ${table} — flagged: ${result.answer_flagged}`);
  return { status: "ok", updated: result.changes_made, flagged: result.answer_flagged };
}

async function processWithConcurrency<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
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

  await log("started", `Review function triggered (batch_size=${BATCH_SIZE} concurrency=${CONCURRENCY})`);
  const outcomes: Array<{ table: string; questionId: any; status: "ok" | "error"; errorType?: string; queued?: boolean }> = [];

  try {
    const tables = ["specialist_questions", "gp_questions"];

    // Collect candidates from both tables, then drain with bounded concurrency.
    const queue: Array<{ table: string; q: any }> = [];
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

      for (const q of questions ?? []) {
        queue.push({ table, q });
      }
    }

    await processWithConcurrency(queue, CONCURRENCY, async ({ table, q }) => {
      const outcome = await reviewQuestion(q, table);
      outcomes.push({
        table,
        questionId: q.id,
        status: outcome.status,
        errorType: outcome.status === "error" ? outcome.errorType : undefined,
        queued: outcome.status === "error" ? outcome.queued : undefined,
      });
    });

    await log("batch_done", `Processed ${queue.length} questions across ${tables.length} tables`);

    const reviewed = outcomes.filter((o) => o.status === "ok").length;
    const failed = outcomes.length - reviewed;
    const queued = outcomes.filter((o) => o.queued).length;
    const errorTypes = [...new Set(outcomes.filter((o) => o.status === "error" && o.errorType).map((o) => o.errorType!))];
    const apiOutage = failed > 0 && reviewed === 0;

    const summary = apiOutage
      ? `0 questions reviewed due to API error (${errorTypes.join(", ") || "unknown"}). ${queued} queued for retry.`
      : `${reviewed}/${outcomes.length} questions reviewed. ${queued} queued for retry.`;

    await log("completed", summary);

    return new Response(
      JSON.stringify({
        success: failed === 0,
        reviewed,
        failed,
        queued,
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
