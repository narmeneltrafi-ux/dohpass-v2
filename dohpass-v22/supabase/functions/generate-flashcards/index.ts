Deno.serve(async (req) => {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";

  const log = async (status: string, message: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/function_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ function_name: "generate-flashcards", status, message }),
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
            model: "claude-haiku-4-5-20251001",
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

      // Retryable: rate limit (429) or overloaded (529)
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

  const SPECIALIST_TOPICS = ["Cardiology","Respiratory","Gastroenterology","Endocrinology","Nephrology","Rheumatology","Neurology","Haematology","Infectious Disease","Oncology"];
  const GP_TOPICS_A = ["Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD","Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression","Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease","GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations","Emergency Chest Pain","Pharmacology and Prescribing"];
  const GP_TOPICS_B = ["Cardiology GP","Respiratory GP","Gastroenterology GP","Endocrinology GP","Nephrology GP","Neurology GP","Haematology GP","Infectious Disease GP","Oncology Red Flags","Ophthalmology","ENT","Dermatology","Psychiatry","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology","Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations","Preventive Medicine","Public Health","Dementia","Osteoarthritis"];

  const today = new Date().getDate();
  const gpTopics = today % 2 !== 0 ? GP_TOPICS_A : GP_TOPICS_B;
  const results: Array<{ subtopic: string; track: string; status: "ok" | "error"; errorType?: string; requestId?: string | null; attempts?: number }> = [];

  await log("started", "generate-flashcards triggered");

  const runBatch = async (topics: string[], track: "specialist" | "gp", system: string, trackLabel: string, gpHint: boolean) => {
    for (const subtopic of topics) {
      const prompt = gpHint
        ? `Return ONLY a JSON array with exactly 5 objects. No explanation, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ]. This is for UAE DOH GP exam. Topic: ${subtopic}. Each object: {"card_type":"concept","front":"question here","back":"answer here","difficulty":"medium","tags":["tag1"]}`
        : `Return ONLY a JSON array with exactly 5 objects. No explanation, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ]. Topic: ${subtopic}. Each object: {"card_type":"concept","front":"question here","back":"answer here","difficulty":"medium","tags":["tag1"]}`;

      const result = await callClaude(prompt);

      if (!result.ok) {
        await log("error", JSON.stringify({
          track,
          subtopic,
          errorType: result.errorType,
          status: result.status,
          requestId: result.requestId,
          attempts: result.attempts,
          message: result.message,
        }));
        results.push({ subtopic, track, status: "error", errorType: result.errorType, requestId: result.requestId, attempts: result.attempts });
        continue;
      }

      try {
        const rows = result.data.map((f: any) => ({
          system,
          track: trackLabel,
          subtopic,
          card_type: f.card_type,
          front: f.front,
          back: f.back,
          difficulty: f.difficulty,
          tags: f.tags,
          is_active: true,
        }));

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

        await log("success", `${track}: Done: ${subtopic}`);
        results.push({ subtopic, track, status: "ok" });
      } catch (err) {
        await log("error", JSON.stringify({ track, subtopic, errorType: "db_or_shape_error", message: String(err) }));
        results.push({ subtopic, track, status: "error", errorType: "db_or_shape_error" });
      }
    }
  };

  try {
    await runBatch(SPECIALIST_TOPICS, "specialist", "Internal Medicine", "Specialist", false);
    await runBatch(gpTopics, "gp", "Primary Care", "GP", true);

    const succeeded = results.filter((r) => r.status === "ok").length;
    const failed = results.length - succeeded;
    const errorTypes = [...new Set(results.filter((r) => r.status === "error" && r.errorType).map((r) => r.errorType!))];
    const apiOutage = failed > 0 && succeeded === 0;

    const summary = apiOutage
      ? `0 flashcards generated due to API error (${errorTypes.join(", ") || "unknown"})`
      : `${succeeded}/${results.length} topics succeeded`;

    await log("completed", summary);

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
    return new Response(
      JSON.stringify({ success: false, generated: 0, summary: "0 flashcards generated due to top-level crash", error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
