import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function log(status: string, message: string) {
  await supabase.from("function_logs").insert({
    function_name: "review-questions",
    status,
    message,
  });
}

async function reviewQuestion(q: any, table: string): Promise<void> {
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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

  const data = await response.json();
  const result = JSON.parse(data.content[0].text.trim());

  if (!result.changes_made && !result.answer_flagged) return;

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
    await log("error", `Update failed for id ${q.id}: ${error.message}`);
  } else {
    await log("success", `Updated id ${q.id} in ${table} — flagged: ${result.answer_flagged}`);
  }
}

serve(async (req) => {
  await log("started", "Review function triggered");
  try {
    const tables = ["specialist_questions", "gp_questions"];
    const BATCH_SIZE = 10;

    for (const table of tables) {
      const { data: questions, error } = await supabase
        .from(table)
        .select("id, q, options, answer, explanation")
        .is("needs_review", null)
        .limit(BATCH_SIZE);

      if (error) {
        await log("error", `Fetch failed for ${table}: ${error.message}`);
        continue;
      }

      for (const q of questions || []) {
        await reviewQuestion(q, table);
      }

      await log("completed", `Reviewed ${questions?.length || 0} questions from ${table}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    await log("error", `Top level crash: ${String(err)}`);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
