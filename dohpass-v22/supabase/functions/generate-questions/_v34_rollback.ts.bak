// Constant-time string comparison. Length mismatch returns false up front;
// equal-length inputs are compared char-by-char with bitwise OR so the
// loop's runtime depends only on length, not on where the strings differ.
const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

Deno.serve(async (req) => {
  const startTime = Date.now();
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const FUNCTION_NAME = "generate-questions";
  const MODEL = "claude-opus-4-5";
  const TIMEOUT_MS = 120_000;

  // ---------- CRON SECRET GATE ----------
  // First check: anything that fails here never touches DB or LLM.
  // Gateway has verify_jwt: false (HS256 service-role JWTs are rejected
  // by this project's gateway as UNAUTHORIZED_LEGACY_JWT — see config.toml).
  // The shared secret is the authentication mechanism instead.
  if (!CRON_SECRET) {
    return new Response(
      JSON.stringify({ success: false, error: "Server misconfigured: CRON_SECRET unset" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!constantTimeEqual(CRON_SECRET, providedSecret)) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  // --------------------------------------

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let batchSize = 5;

  const log = async (status: string, message: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/function_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ function_name: FUNCTION_NAME, status, message }),
    });
  };

  const writeMetrics = async (statusCode: number, errorMessage: string | null) => {
    await fetch(`${SUPABASE_URL}/rest/v1/edge_function_metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        function_name: FUNCTION_NAME,
        execution_ms: Date.now() - startTime,
        batch_size: batchSize,
        model: MODEL,
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        status_code: statusCode,
        error_message: errorMessage,
      }),
    }).catch(() => { /* metrics best-effort */ });
  };

  // ---------- BATCH SIZE: parse + validate ----------
  let parsedBody: any = {};
  if (req.method === "POST") {
    try {
      const text = await req.text();
      parsedBody = text ? JSON.parse(text) : {};
    } catch { /* fall through with defaults */ }
  }
  const requested = parsedBody?.batch_size;
  if (requested !== undefined) {
    const isValid = typeof requested === "number"
      && Number.isInteger(requested)
      && requested >= 1
      && requested <= 10;
    if (!isValid) {
      const errMsg = `batch_size must be an integer between 1 and 10 (got: ${JSON.stringify(requested)})`;
      await writeMetrics(400, errMsg);
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    batchSize = requested;
  }
  // --------------------------------------------------

  // ---------- RATE LIMIT: once per UTC day ----------
  const todayStartUtc = new Date();
  todayStartUtc.setUTCHours(0, 0, 0, 0);
  const since = todayStartUtc.toISOString();
  const rlRes = await fetch(
    `${SUPABASE_URL}/rest/v1/function_logs?function_name=eq.${FUNCTION_NAME}&status=eq.completed&created_at=gte.${since}&select=created_at&order=created_at.desc&limit=1`,
    {
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
      },
    },
  );
  const rlData = await rlRes.json().catch(() => []);
  if (Array.isArray(rlData) && rlData.length > 0) {
    await log("rate_limited", `Skipped: last run at ${rlData[0].created_at}`);
    await writeMetrics(429, `Rate limited: last completed run at ${rlData[0].created_at}`);
    return new Response(
      JSON.stringify({
        success: false,
        rateLimited: true,
        message: `${FUNCTION_NAME} already ran today (UTC)`,
        lastRun: rlData[0].created_at,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }
  // ---------------------------------------------

  const dbInsert = async (table: string, rows: any[]) => {
    return await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(rows),
    });
  };

  type ClaudeOk = { ok: true; data: any[] };
  type ClaudeErr = {
    ok: false;
    errorType: string;
    status: number | null;
    requestId: string | null;
    message: string;
    attempts: number;
    isTimeout?: boolean;
  };

  const callClaudeRaw = async (prompt: string): Promise<ClaudeOk | ClaudeErr> => {
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
            model: MODEL,
            max_tokens: 4000,
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
      if (body?.usage) {
        totalTokensIn += body.usage.input_tokens ?? 0;
        totalTokensOut += body.usage.output_tokens ?? 0;
      }
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
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) cleaned = cleaned.replace(/```json?/g, "").replace(/```/g, "").trim();
      try {
        return { ok: true, data: JSON.parse(cleaned) };
      } catch (err) {
        return { ok: false, errorType: "json_parse_error", status: res.status, requestId, message: String(err), attempts: attempt };
      }
    }
    return { ok: false, errorType: "retries_exhausted", status: null, requestId: null, message: "", attempts: maxAttempts };
  };

  // 120s wall-clock cap on the entire LLM call (incl. retries) — surfaces as 408 to caller.
  const callClaude = async (prompt: string): Promise<ClaudeOk | ClaudeErr> => {
    const timeoutPromise = new Promise<ClaudeErr>((_, reject) => {
      setTimeout(() => reject(new Error("LLM_TIMEOUT")), TIMEOUT_MS);
    });
    try {
      return await Promise.race([callClaudeRaw(prompt), timeoutPromise]);
    } catch (err) {
      if ((err as Error).message === "LLM_TIMEOUT") {
        return {
          ok: false,
          errorType: "llm_timeout",
          status: null,
          requestId: null,
          message: `LLM call exceeded ${TIMEOUT_MS}ms`,
          attempts: 0,
          isTimeout: true,
        };
      }
      throw err;
    }
  };

  await log("started", `Function triggered (batch_size=${batchSize})`);

  const SPECIALIST_TOPICS = ["Cardiology","Respiratory","Gastroenterology","Endocrinology","Nephrology","Rheumatology","Neurology","Haematology","Infectious Disease","Oncology"];
  const GP_TOPICS_A = ["Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD","Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression","Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease","GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations","Emergency Chest Pain","Pharmacology and Prescribing"];
  const GP_TOPICS_B = ["Cardiology GP","Respiratory GP","Gastroenterology GP","Endocrinology GP","Nephrology GP","Neurology GP","Haematology GP","Infectious Disease GP","Oncology Red Flags","Ophthalmology","ENT","Dermatology","Psychiatry","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology","Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations","Preventive Medicine","Public Health","Dementia","Osteoarthritis"];

  const today = new Date().getDate();
  const gpTopics = today % 2 !== 0 ? GP_TOPICS_A : GP_TOPICS_B;

  // Split batch_size between tracks; rotate by day-of-year so different topics get covered each day.
  const specCount = Math.ceil(batchSize / 2);
  const gpCount = batchSize - specCount;
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const specOffset = (dayOfYear * specCount) % SPECIALIST_TOPICS.length;
  const gpOffset = (dayOfYear * gpCount) % gpTopics.length;
  const todaysSpec: string[] = [];
  for (let i = 0; i < specCount; i++) {
    todaysSpec.push(SPECIALIST_TOPICS[(specOffset + i) % SPECIALIST_TOPICS.length]);
  }
  const todaysGp: string[] = [];
  for (let i = 0; i < gpCount; i++) {
    todaysGp.push(gpTopics[(gpOffset + i) % gpTopics.length]);
  }

  const results: Array<{ topic: string; track: string; status: "ok" | "error"; errorType?: string; requestId?: string | null; attempts?: number }> = [];
  let timedOut = false;

  try {
    outer: for (const block of [
      { topics: todaysSpec, track: "specialist" as const, table: "specialist_questions" },
      { topics: todaysGp,   track: "gp" as const,         table: "gp_questions" },
    ]) {
      for (const topic of block.topics) {
        const prompt = block.track === "specialist"
          ? `You are a senior consultant medical educator writing items for the UAE DOH Internal Medicine Specialist licensing exam. The exam is administered in Pearson VUE format. The platform selling these questions is being launched commercially — the quality bar is "would a senior consultant in this specialty be willing to put their name on this question?"

Generate exactly 5 high-quality MCQs on: ${topic}

Apply ALL of the following lenses to EVERY question. Items failing any lens will be auto-deactivated by our review system.

## 1. CLINICAL ACCURACY (highest priority)
- Stated answer must be the best answer per the most current major guideline (2024-2026)
- Reference the specific guideline that supports it (NICE, ESC, ADA, GINA, GOLD, ATS/ERS, WHO, BSH, BTS, KDIGO, EASL, ACG, ESMO, NCCN, etc.) — name + number + year
- Never invent a guideline. If you cannot confidently cite a current real guideline, pick a different question
- FORBIDDEN citations (auto-rejected): "current evidence-based clinical guidelines (NICE/WHO)", "WHO recommendations", "international guidelines", "standard practice", "DOH guidelines" without specifics

GUIDELINE FRESHNESS — STRICT:
- The cited guideline year MUST be 2024, 2025, or 2026
- 2023 is acceptable ONLY if no newer version exists for that specific guideline
- 2022 or earlier = AUTO-REJECTED, even if you think it's still current
- Before writing the explanation, ask yourself: "Is there a newer edition of this guideline?" If yes, use the newer one
- Examples: ESC PE Guidelines 2024 (NOT 2019), GOLD 2025 (NOT 2024), GINA 2025, ATS/ERS 2024, ADA 2026

## 2. PEARSON VUE / ITEM-WRITING STYLE
- Stem MUST be a clinical vignette with sufficient detail to answer WITHOUT seeing the options (cover-the-options test). A senior consultant reading the stem alone must be able to state the answer.
- Single best answer — no "all of the above," "none of the above," "A and C"
- Avoid negative framing ("which is NOT...") unless clearly necessary; if used, capitalize the negative word (NOT, LEAST, EXCEPT)
- Distractors must be plausible AND parallel in structure, length, and category
- No clinically irrelevant distractors (no obvious throwaways)
- No "trick" wording or grammatical clues (a/an mismatch, verb agreement)
- Stem must NOT give away the answer by length, specificity, or including the answer's keyword
- EXACTLY 5 options for specialist-level (A through E)
- Avoid absolutes ("always," "never") in distractors unless the answer itself is an absolute clinical rule

## 3. OPTION PARITY (auto-rejected if violated)
- Word-count check: count the words in each option. ALL options must be within ±3 words of each other. If your correct answer is 8 words, distractors must be 5-11 words. NO EXCEPTIONS.
- Specificity parity: if one option includes a specific treatment name (e.g., "nintedanib"), all others must also include specific treatment names. Don't mix specific drug names with generic mechanism descriptions ("antifibrotic therapy" vs "immunosuppressive therapy")
- If options describe duration, ALL must describe duration with the same grammatical structure (e.g., all "for X days" or all "X-day course")
- The correct answer must NOT contain extra qualifiers or extra concepts not present in distractors

## 4. INTERNAL CONSISTENCY (auto-rejected if violated)
- The answer letter MUST match what the explanation argues for
- The vignette, options, and explanation must tell ONE coherent clinical story
- If the explanation says "Option C describes the correct approach", the answer field must be "C"

## 5. NO FILLER (auto-rejected)
- FORBIDDEN phrases: "Vital signs and relevant investigations are reviewed", "Clinical observations are documented", "Relevant investigations are done", or any sentence that adds no clinical information
- Every sentence in the stem must add clinical content

## 6. EXPLANATION QUALITY (~80-150 words)
- Teach, don't just state the answer
- Explain WHY the correct answer is correct, citing the specific current guideline
- Address why EACH wrong option is wrong (one line per distractor minimum)
- End with one clinically useful pearl (a teaching point a consultant would share with a registrar)

## 7. UAE/GULF CONTEXT WHERE RELEVANT
- For diabetes, vitamin D deficiency, consanguinity, thalassaemia, brucellosis — favor UAE/Gulf demographics where clinically appropriate
- Don't force UAE context where it doesn't fit

## SELF-CHECK BEFORE WRITING JSON
Before producing the JSON, verify each question against this checklist. If ANY check fails, rewrite the question:

[ ] Stem passes cover-the-options test (clinician can answer without options)
[ ] All 5 options within ±3 words of each other
[ ] All options use parallel grammatical structure
[ ] Correct answer is NOT longer or more specific than distractors
[ ] Cited guideline is 2024 or newer (or 2023 if newest available)
[ ] Guideline citation includes name + number/edition + year
[ ] No filler phrases ("vital signs reviewed", "observations documented")
[ ] Answer letter matches what explanation argues for
[ ] Each distractor is rebutted in the explanation

Respond ONLY with a valid JSON array. No preamble, no markdown, no backticks. Schema:

[{"topic":"${topic}","subtopic":"specific subtopic","q":"full clinical vignette with demographics + presentation + exam + investigations","options":["A. opt1","B. opt2","C. opt3","D. opt4","E. opt5"],"answer":"A","explanation":"~100-word teaching explanation: why correct (with specific guideline name+year) + why each distractor wrong + clinical pearl"}]`
          : `You are a senior consultant medical educator writing items for the UAE DOH General Practitioner licensing exam. The exam is administered in Pearson VUE format. The platform selling these questions is being launched commercially — the quality bar is "would a senior GP consultant be willing to put their name on this question?"

Generate exactly 5 high-quality clinical vignette MCQs on: ${topic}

Apply ALL of the following lenses to EVERY question. Items failing any lens will be auto-deactivated by our review system.

## 1. CLINICAL ACCURACY (highest priority)
- Stated answer must be the best answer per the most current major guideline (2024-2026)
- Reference the specific guideline (NICE, ESC, ADA, GINA, GOLD, BTS/SIGN, RCGP, WHO, KDIGO) — name + number + year (e.g. "NICE NG28 2022", "GOLD 2025", "BTS/SIGN 158 2024")
- Never invent a guideline
- FORBIDDEN citations (auto-rejected): "current evidence-based clinical guidelines (NICE/WHO)", "WHO recommendations", "international consensus", "DOH/MOH/HAAD guidelines" without a specific document name

GUIDELINE FRESHNESS — STRICT:
- The cited guideline year MUST be 2024, 2025, or 2026
- 2023 is acceptable ONLY if no newer version exists for that specific guideline
- 2022 or earlier = AUTO-REJECTED, even if you think it's still current
- Before writing the explanation, ask yourself: "Is there a newer edition of this guideline?" If yes, use the newer one
- Examples: ESC PE Guidelines 2024 (NOT 2019), GOLD 2025 (NOT 2024), GINA 2025, ATS/ERS 2024, ADA 2026

## 2. PEARSON VUE / ITEM-WRITING STYLE
- Stem MUST be a primary care clinical vignette with patient demographics, presenting complaint, relevant history, exam findings, at least one investigation or observation, realistic for UAE primary care
- Cover-the-options test: a GP reading the stem alone must be able to state the answer
- Single best answer — no "all of the above," "none of the above"
- Avoid negative framing; if used, capitalize the negative word
- 4-5 options (PREFER 5 for higher discrimination)
- No grammatical clues, no "trick" wording

## 3. OPTION PARITY (auto-rejected if violated)
- Word-count check: count the words in each option. ALL options must be within ±3 words of each other. If your correct answer is 8 words, distractors must be 5-11 words. NO EXCEPTIONS.
- Specificity parity: if one option includes a specific treatment name (e.g., "nintedanib"), all others must also include specific treatment names. Don't mix specific drug names with generic mechanism descriptions ("antifibrotic therapy" vs "immunosuppressive therapy")
- If options describe duration, ALL must describe duration with the same grammatical structure (e.g., all "for X days" or all "X-day course")
- The correct answer must NOT contain extra qualifiers or extra concepts not present in distractors

## 4. INTERNAL CONSISTENCY (auto-rejected if violated)
- Answer letter MUST match what the explanation argues for
- Stem, options, and explanation must form one coherent clinical narrative

## 5. NO FILLER (auto-rejected)
- FORBIDDEN phrases: "Vital signs and relevant investigations are reviewed", "Observations are documented", "Relevant investigations are done"
- Every sentence in the stem must add clinical content

## 6. EXPLANATION QUALITY (~80-150 words)
- Teach, don't just state the answer
- Why correct (with specific guideline name + year)
- Why each distractor wrong (one line each)
- End with one UAE-relevant primary care pearl

## 7. UAE/GULF CONTEXT
- For diabetes, vitamin D deficiency, consanguinity, thalassaemia, brucellosis, vector-borne illness — favor UAE/Gulf demographics
- For paediatrics, antenatal care — UAE health authority pathways where applicable

## SELF-CHECK BEFORE WRITING JSON
Before producing the JSON, verify each question against this checklist. If ANY check fails, rewrite the question:

[ ] Stem passes cover-the-options test (clinician can answer without options)
[ ] All 5 options within ±3 words of each other
[ ] All options use parallel grammatical structure
[ ] Correct answer is NOT longer or more specific than distractors
[ ] Cited guideline is 2024 or newer (or 2023 if newest available)
[ ] Guideline citation includes name + number/edition + year
[ ] No filler phrases ("vital signs reviewed", "observations documented")
[ ] Answer letter matches what explanation argues for
[ ] Each distractor is rebutted in the explanation

Respond ONLY with a valid JSON array. No preamble, no markdown, no backticks. Schema:

[{"broad_topic":"specialty category","topic":"${topic}","q":"full GP vignette","options":["A. opt1","B. opt2","C. opt3","D. opt4","E. opt5"],"answer":"A","explanation":"~100-word teaching explanation: why correct (with specific guideline name+year) + distractor rebuttal + UAE-relevant pearl","difficulty":"easy|medium|hard","source":"specific guideline name and year (NOT 'DOH Guidelines')","is_active":true}]`;

        const result = await callClaude(prompt);

        if (!result.ok) {
          await log("error", JSON.stringify({
            track: block.track,
            topic,
            errorType: result.errorType,
            status: result.status,
            requestId: result.requestId,
            attempts: result.attempts,
            message: result.message,
          }));
          results.push({ topic, track: block.track, status: "error", errorType: result.errorType, requestId: result.requestId, attempts: result.attempts });
          if (result.isTimeout) {
            timedOut = true;
            break outer;
          }
          continue;
        }

        try {
          const rows = block.track === "specialist"
            ? result.data.map((q: any) => ({
                topic: q.topic, subtopic: q.subtopic, q: q.q,
                options: q.options, answer: q.answer.charAt(0), explanation: q.explanation,
              }))
            : result.data.map((q: any) => ({
                broad_topic: q.broad_topic, topic: q.topic, q: q.q,
                options: q.options, answer: q.answer.charAt(0),
                explanation: q.explanation, difficulty: q.difficulty,
                source: q.source, is_active: q.is_active,
              }));
          await dbInsert(block.table, rows);
          await log("success", `${block.track === "specialist" ? "Specialist" : "GP"}: 5 questions for ${topic}`);
          results.push({ topic, track: block.track, status: "ok" });
        } catch (err) {
          await log("error", JSON.stringify({ track: block.track, topic, errorType: "db_or_shape_error", message: String(err) }));
          results.push({ topic, track: block.track, status: "error", errorType: "db_or_shape_error" });
        }
      }
    }

    const succeeded = results.filter((r) => r.status === "ok").length;
    const failed = results.length - succeeded;
    const errorTypes = [...new Set(results.filter((r) => r.status === "error" && r.errorType).map((r) => r.errorType!))];
    const apiOutage = failed > 0 && succeeded === 0;

    if (timedOut) {
      const summary = `Partial: ${succeeded}/${batchSize} topics persisted before LLM timeout`;
      await log("timeout", summary);
      await writeMetrics(408, "LLM call exceeded 120s timeout");
      return new Response(
        JSON.stringify({
          success: succeeded > 0,
          partial: true,
          generated: succeeded,
          failed,
          errorTypes,
          summary,
          results,
        }),
        { status: 408, headers: { "Content-Type": "application/json" } },
      );
    }

    const summary = apiOutage
      ? `0 questions generated due to API error (${errorTypes.join(", ") || "unknown"})`
      : `${succeeded}/${results.length} topics succeeded`;

    await log("completed", summary);
    await writeMetrics(200, apiOutage ? `API outage: ${errorTypes.join(", ")}` : null);

    return new Response(
      JSON.stringify({
        success: succeeded > 0,
        generated: succeeded,
        failed,
        errorTypes,
        summary,
        results,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    await log("error", JSON.stringify({ errorType: "top_level_crash", message: String(err) }));
    await writeMetrics(500, String(err).slice(0, 500));
    return new Response(
      JSON.stringify({ success: false, generated: 0, summary: "0 questions generated due to top-level crash", error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
