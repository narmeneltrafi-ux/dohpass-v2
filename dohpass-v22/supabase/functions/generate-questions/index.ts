// v35: blueprint-weighted topic distribution + bulk-sweep quality gates (May 2026). Mirrors active 2,265 spec / 730 GP standard.

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

// ---------- v35 SPECIALIST TOPIC WEIGHTS (IM blueprint gap-fill) ----------
const TOPIC_WEIGHTS_V35: Record<string, number> = {
  'Cardiology': 0.22,
  'Oncology': 0.18,
  'Geriatrics': 0.10,
  'Obstetrics': 0.10,
  'Infectious Disease': 0.10,
  'Respiratory': 0.09,
  'Immunology': 0.07,
  'Ophthalmology': 0.03,
  'ENT': 0.03,
  'Biostatistics': 0.04,
  'Healthcare Management': 0.02,
  'Endocrinology': 0.02,
  // PAUSED (already at/over blueprint weight; do NOT generate):
  // Neurology, Dermatology, Haematology, Nephrology,
  // Rheumatology, Psychiatry, Gastroenterology, Pharmacology
};

// Tier 1 subtopic rotation guidance for v35 gap topics — injected into the prompt
// so the LLM rotates within the topic instead of hammering the same subtopic.
const TIER1_SUBTOPICS_V35: Record<string, string> = {
  'Oncology': 'solid tumours (lung/breast/CRC/prostate), heme malignancies (CML/CLL/AML/lymphoma/MM), oncologic emergencies (TLS, cord compression, SVC, neutropenic fever, hyperCa), paraneoplastic syndromes, screening guidelines, immunotherapy toxicity, survivorship',
  'Geriatrics': 'dementia/delirium differentiation, falls, polypharmacy/Beers, pressure injuries, incontinence, capacity assessment, end-of-life, frailty, sarcopenia',
  'Obstetrics': 'HTN in pregnancy (incl. pre-eclampsia/HELLP), GDM, thyroid in pregnancy, VTE in pregnancy, peripartum cardiomyopathy, AUB, contraception, menopause/HRT, gynae cancer screening',
  'Immunology': 'anaphylaxis mgmt, urticaria/angioedema (incl. C1 esterase), drug allergy, primary immunodeficiency (CVID, IgA def), eosinophilic disorders',
};

const weightedPickTopic = (): string => {
  const entries = Object.entries(TOPIC_WEIGHTS_V35);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
};

Deno.serve(async (req) => {
  const startTime = Date.now();
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const FUNCTION_NAME = "generate-questions";
  const FUNCTION_VERSION = "v35";
  const SOURCE_TAG = "layer2-v35";
  const MODEL = "claude-opus-4-5";
  const TIMEOUT_MS = 120_000;

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

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let batchSize = 4;
  let dryRun = false;

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

  // ---------- BATCH SIZE: parse + validate (v35 cap = 4 per 150s edge wall clock) ----------
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
      && requested <= 4;
    if (!isValid) {
      const errMsg = `batch_size must be an integer between 1 and 4 (got: ${JSON.stringify(requested)})`;
      await writeMetrics(400, errMsg);
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    batchSize = requested;
  }
  dryRun = parsedBody?.dry_run === true;

  // ---------- RATE LIMIT: once per UTC day (skipped for dry runs) ----------
  if (!dryRun) {
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
  }

  // ---------- INSERT-TIME SAFETY: dedup guard (similarity > 0.85 vs q_original) ----------
  // Refuses to insert any candidate whose stem fuzzy-matches a deactivated row's
  // original q_original — prevents the bulk-sweep flagged set from being re-introduced
  // under a new id. Implemented as a SECURITY DEFINER RPC that uses pg_trgm.
  const isDuplicate = async (table: string, q: string): Promise<boolean> => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_question_dup_v35`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SB_KEY,
          "Authorization": `Bearer ${SB_KEY}`,
        },
        body: JSON.stringify({ p_table: table, p_q: q }),
      });
      if (!res.ok) return false;
      const body = await res.json().catch(() => false);
      return body === true;
    } catch {
      return false;
    }
  };

  // INSERT-only. Never UPDATE. Never write to is_active=false rows.
  // needs_review is left NULL for new rows; the bulk-sweep workflow only acts
  // on needs_review=true rows, so it cannot accidentally touch v35 inserts.
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

  await log("started", `Function triggered (${FUNCTION_VERSION}, batch_size=${batchSize}, dry_run=${dryRun})`);

  // GP rotation preserved from v34 — gap-fill effort is on the IM specialist track.
  const GP_TOPICS_A = ["Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD","Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression","Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease","GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations","Emergency Chest Pain","Pharmacology and Prescribing"];
  const GP_TOPICS_B = ["Cardiology GP","Respiratory GP","Gastroenterology GP","Endocrinology GP","Nephrology GP","Neurology GP","Haematology GP","Infectious Disease GP","Oncology Red Flags","Ophthalmology","ENT","Dermatology","Psychiatry","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology","Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations","Preventive Medicine","Public Health","Dementia","Osteoarthritis"];

  const today = new Date().getDate();
  const gpTopics = today % 2 !== 0 ? GP_TOPICS_A : GP_TOPICS_B;

  const specCount = Math.ceil(batchSize / 2);
  const gpCount = batchSize - specCount;
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const gpOffset = (dayOfYear * gpCount) % gpTopics.length;

  // Specialist topics drawn from v35 weighted distribution (blueprint gap-fill).
  const todaysSpec: string[] = [];
  for (let i = 0; i < specCount; i++) {
    todaysSpec.push(weightedPickTopic());
  }
  const todaysGp: string[] = [];
  for (let i = 0; i < gpCount; i++) {
    todaysGp.push(gpTopics[(gpOffset + i) % gpTopics.length]);
  }

  const results: Array<{
    topic: string;
    track: string;
    status: "ok" | "error" | "skipped_dup";
    errorType?: string;
    requestId?: string | null;
    attempts?: number;
    inserted?: number;
    skippedDup?: number;
    sample?: any;
  }> = [];
  let timedOut = false;

  // ---------- v35 BULK-SWEEP REJECTION CRITERIA (Gates 1-12) ----------
  // The 10 violation patterns Sonnet 4.6 used to deactivate 2,000 specialist rows
  // in the bulk review sweep. Embedded as hard self-check rules the model MUST
  // apply BEFORE returning output.
  const QUALITY_GATES_V35 = `
QUALITY GATES — ALL must pass or regenerate the question:

GATE 1 (Cover-the-options test): The lead-in alone, without seeing options, must NOT let a knowledgeable candidate guess the answer. The vignette must constrain the answer, not the lead-in phrasing. Example fail: "What is the first-line treatment for acute anaphylaxis?" — answerable without options. Pass: requires the vignette's specific clinical details to disambiguate.

GATE 2 (Length parity): Correct answer length must be within ±30% of mean distractor length.

GATE 3 (Five options): Exactly 5 options labelled A) through E). Not 4. Not 6.

GATE 4 (Real citations only): Cite specific guideline + year (e.g. "ESC 2023 ACS guidelines", "KDIGO 2024 CKD"). Reject filler like "per NICE" or "per WHO guidelines" with no specificity. If no specific citation is verifiable, write "general internal medicine principle" — NEVER fabricate trial names or guideline years.

GATE 5 (Parallel distractors): All 5 options must be the same category (all diagnoses, OR all medications, OR all investigations — never mixed). Each distractor must be a clinically plausible mistake, not obviously wrong.

GATE 6 (Teaching explanation): Explanation must include:
  - Why correct answer is right (mechanism + guideline)
  - One-line rebuttal for EACH distractor (4 lines)
  - One key learning point
  - Citation (real, per Gate 4)
Total explanation ≥ 800 characters target.

GATE 7 (Internal consistency): Stem clinical details + lead-in + correct answer + explanation logic must all align. No contradictions.

GATE 8 (No filler): Reject vignettes containing empty phrases like "vital signs reviewed", "examination was unremarkable" without specifying the actually-relevant findings.

GATE 9 (Positive framing): No "NOT", "EXCEPT", "LEAST", "INCORRECT" lead-ins.

GATE 10 (Mechanics): No grammar errors. No "an" before consonant. No singular/plural mismatch.

GATE 11 (Length floor): Vignette stem ≥ 280 characters (active bank avg = 466). Aim for 400-550 chars.

GATE 12 (Five options confirmed): Final array length must equal 5 before output.
`.trim();

  try {
    outer: for (const block of [
      { topics: todaysSpec, track: "specialist" as const, table: "specialist_questions" },
      { topics: todaysGp,   track: "gp" as const,         table: "gp_questions" },
    ]) {
      for (const topic of block.topics) {
        const subtopicGuidance = block.track === "specialist" && TIER1_SUBTOPICS_V35[topic]
          ? `\n\nSUBTOPIC ROTATION FOR ${topic} — pick ONE distinct subtopic per question (do not repeat across the 5 items in this batch):\n${TIER1_SUBTOPICS_V35[topic]}\n`
          : "";

        const prompt = block.track === "specialist"
          ? `You are a senior consultant medical educator writing items for the UAE DOH Internal Medicine Specialist licensing exam (Pearson VUE format). The platform is being launched commercially — quality bar: "would a senior consultant in this specialty be willing to put their name on this question?"

Generate exactly 5 high-quality SBA MCQs on: ${topic}${subtopicGuidance}

You MUST mirror the active 2,265-row specialist standard: avg stem ≥ 466 chars, avg explanation ≥ 1,111 chars, 5-option SBA with parallel distractors. Do NOT regress toward the deactivated set.

${QUALITY_GATES_V35}

## CLINICAL ACCURACY (highest priority)
- Stated answer must be the best answer per the most current major guideline (2024-2026)
- Reference the specific guideline (NICE, ESC, ADA, GINA, GOLD, ATS/ERS, WHO, BSH, BTS, KDIGO, EASL, ACG, ESMO, NCCN, etc.) — name + number + year
- Never invent a guideline. If no current real guideline can be cited, write "general internal medicine principle" (per Gate 4) — NEVER fabricate.
- FORBIDDEN citations (auto-rejected): "current evidence-based clinical guidelines (NICE/WHO)", "WHO recommendations", "international guidelines", "standard practice", "DOH guidelines" without specifics.

GUIDELINE FRESHNESS — STRICT:
- Cited guideline year MUST be 2024, 2025, or 2026.
- 2023 acceptable ONLY if no newer version exists.
- 2022 or earlier = AUTO-REJECTED.
- Examples: ESC PE Guidelines 2024 (NOT 2019), GOLD 2025, GINA 2025, ATS/ERS 2024, ADA 2026.

## PEARSON VUE / DOH STEM FORMAT
- Stem = clinical vignette: demographics, presenting complaint, relevant history, exam findings, ≥1 investigation/observation. Realistic for UAE practice.
- Single best answer. EXACTLY 5 options A) through E). No "all of the above," "none of the above," "A and C".
- Distractors must be plausible AND parallel in structure, length, and category.
- No grammatical clues (a/an mismatch, verb agreement). No absolutes ("always," "never") unless answer itself is absolute.

## UAE / GULF EPIDEMIOLOGY EMPHASIS
Where clinically relevant, weight toward UAE/Gulf demographics: consanguinity, brucellosis, MERS-CoV, leishmaniasis, BCG vaccination history, thalassaemia carrier states, vitamin D deficiency, T2DM prevalence. Do NOT force UAE context where it does not fit.

## SELF-CHECK BEFORE WRITING JSON
For EACH of the 5 questions, verify Gates 1-12 above. If ANY gate fails, rewrite that question before continuing. Do NOT emit the JSON until all 5 questions pass all 12 gates.

Respond ONLY with a valid JSON array. No preamble, no markdown, no backticks. Schema:

[{"topic":"${topic}","subtopic":"specific subtopic from rotation list","q":"full clinical vignette ≥280 chars (target 400-550) with demographics + presentation + exam + investigations","options":["A. opt1","B. opt2","C. opt3","D. opt4","E. opt5"],"answer":"A","explanation":"≥800-char teaching explanation: why correct (mechanism + specific guideline name+year) + one-line rebuttal for EACH of the 4 distractors + key learning point"}]`
          : `You are a senior consultant medical educator writing items for the UAE DOH General Practitioner licensing exam (Pearson VUE format). The platform is being launched commercially — quality bar: "would a senior GP consultant be willing to put their name on this question?"

Generate exactly 5 high-quality clinical vignette MCQs on: ${topic}

${QUALITY_GATES_V35}

## CLINICAL ACCURACY (highest priority)
- Stated answer must be the best answer per the most current major guideline (2024-2026).
- Reference the specific guideline (NICE, ESC, ADA, GINA, GOLD, BTS/SIGN, RCGP, WHO, KDIGO) — name + number + year.
- Never invent a guideline. If no current real guideline can be cited, write "general internal medicine principle" (per Gate 4).
- FORBIDDEN citations: "current evidence-based clinical guidelines (NICE/WHO)", "WHO recommendations", "international consensus", "DOH/MOH/HAAD guidelines" without a specific document name.

GUIDELINE FRESHNESS — STRICT (same as specialist track):
- 2024-2026 required. 2023 only if no newer. 2022 or earlier = AUTO-REJECTED.

## PEARSON VUE / DOH STEM FORMAT
- Primary care vignette: demographics, presenting complaint, relevant history, exam, ≥1 investigation/observation, realistic for UAE primary care.
- Single best answer. EXACTLY 5 options A) through E).
- Distractors plausible, parallel in structure/length/category.

## UAE / GULF EPIDEMIOLOGY EMPHASIS
For diabetes, vitamin D deficiency, consanguinity, thalassaemia, brucellosis, MERS-CoV, leishmaniasis, BCG, vector-borne illness — favor UAE/Gulf demographics. For paediatrics, antenatal care — UAE health authority pathways where applicable.

## SELF-CHECK BEFORE WRITING JSON
For EACH of the 5 questions, verify Gates 1-12. If ANY gate fails, rewrite the question.

Respond ONLY with a valid JSON array. No preamble, no markdown, no backticks. Schema:

[{"broad_topic":"specialty category","topic":"${topic}","q":"full GP vignette ≥280 chars","options":["A. opt1","B. opt2","C. opt3","D. opt4","E. opt5"],"answer":"A","explanation":"≥800-char teaching explanation: why correct (specific guideline name+year) + rebuttal for each distractor + UAE-relevant pearl","difficulty":"easy|medium|hard","source":"specific guideline name and year (NOT 'DOH Guidelines')"}]`;

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
          // Gate 12 enforcement at insert time + dedup guard (similarity > 0.85 vs q_original).
          const candidates: any[] = Array.isArray(result.data) ? result.data : [];
          const accepted: any[] = [];
          let skippedDup = 0;
          let skippedShape = 0;

          for (const q of candidates) {
            if (!q || typeof q.q !== "string" || !Array.isArray(q.options) || q.options.length !== 5) {
              skippedShape++;
              continue;
            }
            if (await isDuplicate(block.table, q.q)) {
              skippedDup++;
              continue;
            }
            accepted.push(q);
          }

          const rows = block.track === "specialist"
            ? accepted.map((q: any) => ({
                topic: q.topic,
                subtopic: q.subtopic,
                q: q.q,
                options: q.options,
                answer: String(q.answer).charAt(0),
                explanation: q.explanation,
                is_active: true,
                needs_review: null,
                source: SOURCE_TAG,
              }))
            : accepted.map((q: any) => ({
                broad_topic: q.broad_topic,
                topic: q.topic,
                q: q.q,
                options: q.options,
                answer: String(q.answer).charAt(0),
                explanation: q.explanation,
                difficulty: q.difficulty,
                source: SOURCE_TAG,
                is_active: true,
                needs_review: null,
              }));

          if (!dryRun && rows.length > 0) {
            await dbInsert(block.table, rows);
          }
          await log(
            "success",
            `${block.track === "specialist" ? "Specialist" : "GP"} ${FUNCTION_VERSION}: ${rows.length}/${candidates.length} inserted for ${topic} (skipped_dup=${skippedDup}, skipped_shape=${skippedShape}, dry_run=${dryRun})`,
          );
          results.push({
            topic,
            track: block.track,
            status: "ok",
            inserted: rows.length,
            skippedDup,
            sample: dryRun ? candidates[0] ?? null : undefined,
          });
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
          version: FUNCTION_VERSION,
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
      : `${succeeded}/${results.length} topics succeeded (${FUNCTION_VERSION})`;

    await log(dryRun ? "dry_run_completed" : "completed", summary);
    await writeMetrics(200, apiOutage ? `API outage: ${errorTypes.join(", ")}` : null);

    return new Response(
      JSON.stringify({
        success: succeeded > 0,
        version: FUNCTION_VERSION,
        dryRun,
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
      JSON.stringify({ success: false, version: FUNCTION_VERSION, generated: 0, summary: "0 questions generated due to top-level crash", error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
