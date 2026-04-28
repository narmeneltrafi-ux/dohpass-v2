Deno.serve(async (req) => {
  const startTime = Date.now();
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  const FUNCTION_NAME = "generate-flashcards";
  const MODEL = "claude-haiku-4-5-20251001";

  // ---- Step 3 instrumentation (observation only, no behaviour change) ----
  // Record per-phase wall-clock so we can answer "where is the 31s going?"
  // without reading function_logs timestamps. There are no embeddings in this
  // function so we only track LLM + DB. The function does 4 LLM calls and 4
  // DB writes per invocation (2 specialist topics + 2 GP topics × 1 batch each).
  const llm_ms: number[] = [];
  const db_ms: number[] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  // -----------------------------------------------------------------------

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

  const summarizePhases = () => {
    const reduce = (arr: number[]) => ({
      count: arr.length,
      total_ms: arr.reduce((a, b) => a + b, 0),
      max_ms: arr.length ? Math.max(...arr) : 0,
      avg_ms: arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0,
    });
    return { llm: reduce(llm_ms), db: reduce(db_ms) };
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
        batch_size: null,
        model: MODEL,
        tokens_in: totalTokensIn,
        tokens_out: totalTokensOut,
        status_code: statusCode,
        error_message: errorMessage,
        phase_breakdown: summarizePhases(),
      }),
    }).catch(() => { /* metrics best-effort */ });
  };

  // ---------- RATE LIMIT: once per 24h ----------
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
        message: `${FUNCTION_NAME} already ran in last 24h`,
        lastRun: rlData[0].created_at,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }
  // ---------------------------------------------

  type ClaudeOk = { ok: true; data: any[] };
  type ClaudeErr = {
    ok: false;
    errorType: string;
    status: number | null;
    requestId: string | null;
    message: string;
    attempts: number;
  };

  const callClaude = async (prompt: string): Promise<ClaudeOk | ClaudeErr> => {
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
            max_tokens: 2000,
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
        return { ok: false, errorType: "malformed_response", status: res.status, requestId, message: JSON.stringify(body ?? {}).slice(0, 200), attempts: attempt };
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

  // SPECIALIST_TOPICS values are already valid `system` names — system = subtopic for these.
  const SPECIALIST_TOPICS = [
    "Cardiology",
    "Respiratory",
    "Gastroenterology",
    "Endocrinology",
    "Nephrology",
    "Rheumatology",
    "Neurology",
    "Haematology",
    "Infectious Disease",
    "Oncology",
    "Pharmacology",
    "Dermatology",
    "Psychiatry",
  ];

  const GP_TOPICS = [
    "Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD",
    "Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression",
    "Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease",
    "GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations",
    "Emergency Chest Pain","Pharmacology and Prescribing","Ophthalmology","ENT","Dermatology GP",
    "Psychiatry GP","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology",
    "Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations",
    "Preventive Medicine","Public Health","Dementia","Osteoarthritis",
  ];

  // Maps a GP topic to its proper `system` (mirrors the SQL redistribution from Apr 27, 2026).
  // Without this, every new GP card would land in 'Primary Care' and re-create the orphan bucket.
  const GP_TOPIC_TO_SYSTEM: Record<string, string> = {
    "Hypertension": "Cardiology",
    "Dyslipidaemia": "Cardiology",
    "Ischaemic Heart Disease": "Cardiology",
    "Heart Failure": "Cardiology",
    "Atrial Fibrillation": "Cardiology",
    "Emergency Chest Pain": "Cardiology",
    "Diabetes Type 2": "Endocrinology",
    "Thyroid Disorders": "Endocrinology",
    "Asthma": "Respiratory",
    "COPD": "Respiratory",
    "UTI": "Nephrology",
    "Anaemia": "Haematology",
    "Depression": "Mental Health",
    "Anxiety": "Mental Health",
    "Dementia": "Mental Health",
    "Psychiatry GP": "Mental Health",
    "Epilepsy": "Neurology",
    "Stroke and TIA": "Neurology",
    "Osteoporosis": "Musculoskeletal",
    "Rheumatoid Arthritis": "Musculoskeletal",
    "Orthopaedics and MSK": "Musculoskeletal",
    "Osteoarthritis": "Musculoskeletal",
    "Peptic Ulcer Disease": "Gastroenterology",
    "GERD": "Gastroenterology",
    "Contraception": "Women's Health",
    "Antenatal Care": "Women's Health",
    "Obstetrics and Gynaecology": "Women's Health",
    "Paediatric Common Illnesses": "Paediatrics",
    "Paediatrics": "Paediatrics",
    "Vaccinations": "Public Health",
    "Preventive Medicine": "Public Health",
    "Public Health": "Public Health",
    "Pharmacology and Prescribing": "Pharmacology",
    "Ophthalmology": "Ophthalmology",
    "ENT": "ENT",
    "Dermatology GP": "Dermatology",
    "Urology": "Urology",
    "Emergency Medicine GP": "Emergency Medicine",
    "Geriatrics": "Geriatrics",
    "Palliative Care": "Palliative Care",
    "Radiology and Investigations": "Radiology",
  };

  // Rotate: 2 specialist + 2 GP topics per day = 20 cards (5 each)
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000);
  const todaysSpecialist = [
    SPECIALIST_TOPICS[(dayOfYear * 2) % SPECIALIST_TOPICS.length],
    SPECIALIST_TOPICS[(dayOfYear * 2 + 1) % SPECIALIST_TOPICS.length],
  ];
  const todaysGp = [
    GP_TOPICS[(dayOfYear * 2) % GP_TOPICS.length],
    GP_TOPICS[(dayOfYear * 2 + 1) % GP_TOPICS.length],
  ];

  const results: Array<{ subtopic: string; track: string; status: "ok" | "error"; errorType?: string; requestId?: string | null; attempts?: number }> = [];

  await log("started", `generate-flashcards triggered. Today: spec=[${todaysSpecialist.join(", ")}] gp=[${todaysGp.join(", ")}]`);

  const runBatch = async (topics: string[], track: "specialist" | "gp", gpHint: boolean) => {
    for (const subtopic of topics) {
      const prompt = gpHint
        ? `Return ONLY a JSON array with exactly 5 objects. No explanation, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ]. This is for UAE DOH GP exam. Topic: ${subtopic}. Each object: {"card_type":"concept","front":"question here","back":"answer here","difficulty":"medium","tags":["tag1"]}`
        : `Return ONLY a JSON array with exactly 5 objects. No explanation, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ]. This is for UAE DOH Internal Medicine Specialist exam. Topic: ${subtopic}. Each object: {"card_type":"concept","front":"question here","back":"answer here","difficulty":"medium","tags":["tag1"]}`;

      // Time the LLM call (incl. retries inside callClaude). One sample per topic.
      const llmStart = Date.now();
      const result = await callClaude(prompt);
      llm_ms.push(Date.now() - llmStart);

      if (!result.ok) {
        await log("error", JSON.stringify({ track, subtopic, errorType: result.errorType, status: result.status, requestId: result.requestId, attempts: result.attempts, message: result.message }));
        results.push({ subtopic, track, status: "error", errorType: result.errorType, requestId: result.requestId, attempts: result.attempts });
        continue;
      }

      // Resolve the system field per-card so cards land in the correct tile.
      // Specialist topics ARE the system names; GP topics map via GP_TOPIC_TO_SYSTEM.
      const systemForCard = track === "specialist"
        ? subtopic
        : (GP_TOPIC_TO_SYSTEM[subtopic] ?? "General Practice");

      try {
        const rows = result.data.map((f: any) => ({
          system: systemForCard,
          track,
          subtopic,
          card_type: f.card_type,
          front: f.front,
          back: f.back,
          difficulty: f.difficulty,
          tags: f.tags,
          is_active: true,
        }));

        // Time the DB write (one PostgREST insert per topic).
        const dbStart = Date.now();
        await fetch(`${SUPABASE_URL}/rest/v1/flashcards`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SB_KEY,
            "Authorization": `Bearer ${SB_KEY}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify(rows),
        });
        db_ms.push(Date.now() - dbStart);

        await log("success", `${track}: Done: ${subtopic} → ${systemForCard}`);
        results.push({ subtopic, track, status: "ok" });
      } catch (err) {
        await log("error", JSON.stringify({ track, subtopic, errorType: "db_or_shape_error", message: String(err) }));
        results.push({ subtopic, track, status: "error", errorType: "db_or_shape_error" });
      }
    }
  };

  try {
    await runBatch(todaysSpecialist, "specialist", false);
    await runBatch(todaysGp, "gp", true);

    const succeeded = results.filter((r) => r.status === "ok").length;
    const failed = results.length - succeeded;
    const errorTypes = [...new Set(results.filter((r) => r.status === "error" && r.errorType).map((r) => r.errorType!))];
    const apiOutage = failed > 0 && succeeded === 0;
    const summary = apiOutage
      ? `0 flashcards generated due to API error (${errorTypes.join(", ") || "unknown"})`
      : `${succeeded}/${results.length} topics succeeded (${succeeded * 5} cards)`;

    await log("completed", summary);
    await writeMetrics(succeeded > 0 ? 200 : 502, apiOutage ? `API outage: ${errorTypes.join(", ")}` : null);
    return new Response(JSON.stringify({ success: succeeded > 0, generated: succeeded, failed, errorTypes, summary, results }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    await log("error", JSON.stringify({ errorType: "top_level_crash", message: String(err) }));
    await writeMetrics(500, String(err).slice(0, 500));
    return new Response(JSON.stringify({ success: false, generated: 0, summary: "top-level crash", error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
