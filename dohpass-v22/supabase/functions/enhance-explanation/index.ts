// enhance-explanation — on-demand AI teaching explanation for wrong answers.
// Called by paid users after submitting an incorrect answer. Calls Claude to
// generate a richer explanation than the static DB copy, focused on clinical
// reasoning and the specific distractor the user chose.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap for inline explanations

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Require a valid Supabase JWT — prevents unauthenticated calls.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: {
    questionText: string;
    options: string[];
    correctLetter: string;
    selectedLetter: string;
    existingExplanation?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { questionText, options, correctLetter, selectedLetter, existingExplanation } = body;
  if (!questionText || !options?.length || !correctLetter || !selectedLetter) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const correctIdx = correctLetter.charCodeAt(0) - 65;
  const selectedIdx = selectedLetter.charCodeAt(0) - 65;
  const correctText = options[correctIdx] ?? correctLetter;
  const selectedText = options[selectedIdx] ?? selectedLetter;

  const prompt = `You are a senior clinical educator helping a doctor prepare for the UAE DOH licensing exam.

Question: ${questionText}

Options:
${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}

Correct answer: ${correctLetter}. ${correctText}
Student's answer: ${selectedLetter}. ${selectedText}
${existingExplanation ? `\nExisting explanation: ${existingExplanation}` : ""}

Write a focused teaching explanation in 2–3 short paragraphs:
1. Why ${correctLetter} is correct — explain the clinical reasoning and key mechanism
2. Why ${selectedLetter} was a plausible but wrong choice — address the specific misconception
3. A memorable clinical pearl or high-yield fact to anchor this concept

Be concise and direct. Use plain English. Do not repeat the question. Do not use headers.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Claude error ${res.status}: ${err.slice(0, 200)}` }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";

    return new Response(JSON.stringify({ explanation: text }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
