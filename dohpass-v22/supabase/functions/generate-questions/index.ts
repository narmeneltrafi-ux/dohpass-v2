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
      body: JSON.stringify({ function_name: "generate-questions", status, message }),
    });
  };

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
            model: "claude-opus-4-5",
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

  await log("started", "Function triggered");

  const SPECIALIST_TOPICS = ["Cardiology","Respiratory","Gastroenterology","Endocrinology","Nephrology","Rheumatology","Neurology","Haematology","Infectious Disease","Oncology"];
  const GP_TOPICS_A = ["Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD","Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression","Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease","GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations","Emergency Chest Pain","Pharmacology and Prescribing"];
  const GP_TOPICS_B = ["Cardiology GP","Respiratory GP","Gastroenterology GP","Endocrinology GP","Nephrology GP","Neurology GP","Haematology GP","Infectious Disease GP","Oncology Red Flags","Ophthalmology","ENT","Dermatology","Psychiatry","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology","Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations","Preventive Medicine","Public Health","Dementia","Osteoarthritis"];

  const today = new Date().getDate();
  const gpTopics = today % 2 !== 0 ? GP_TOPICS_A : GP_TOPICS_B;
  const results: Array<{ topic: string; track: string; status: "ok" | "error"; errorType?: string; requestId?: string | null; attempts?: number }> = [];

  try {
    for (const topic of SPECIALIST_TOPICS) {
      const prompt = `You are an expert medical educator for the DOH UAE Internal Medicine Specialist exam. Generate exactly 5 high-quality MCQs on: ${topic}. Respond ONLY with a valid JSON array, no markdown, no backticks: [{"topic":"${topic}","subtopic":"subtopic","q":"question","options":["A. opt1","B. opt2","C. opt3","D. opt4"],"answer":"A","explanation":"explanation"}]`;
      const result = await callClaude(prompt);

      if (!result.ok) {
        await log("error", JSON.stringify({
          track: "specialist",
          topic,
          errorType: result.errorType,
          status: result.status,
          requestId: result.requestId,
          attempts: result.attempts,
          message: result.message,
        }));
        results.push({ topic, track: "specialist", status: "error", errorType: result.errorType, requestId: result.requestId, attempts: result.attempts });
        continue;
      }

      try {
        const rows = result.data.map((q: any) => ({
          topic: q.topic, subtopic: q.subtopic, q: q.q,
          options: q.options, answer: q.answer.charAt(0), explanation: q.explanation,
        }));
        await dbInsert("specialist_questions", rows);
        await log("success", `Specialist: 5 questions for ${topic}`);
        results.push({ topic, track: "specialist", status: "ok" });
      } catch (err) {
        await log("error", JSON.stringify({ track: "specialist", topic, errorType: "db_or_shape_error", message: String(err) }));
        results.push({ topic, track: "specialist", status: "error", errorType: "db_or_shape_error" });
      }
    }

    for (const topic of gpTopics) {
      const prompt = `You are an expert medical educator for the DOH UAE GP exam, Pearson VUE style. Generate exactly 5 clinical vignette MCQs on: ${topic}. Follow UAE/DOH/NICE/WHO guidelines. Respond ONLY with a valid JSON array, no markdown, no backticks: [{"broad_topic":"category","topic":"${topic}","q":"vignette","options":["A. opt1","B. opt2","C. opt3","D. opt4"],"answer":"A","explanation":"explanation","difficulty":"medium","source":"DOH Guidelines","is_active":true}]`;
      const result = await callClaude(prompt);

      if (!result.ok) {
        await log("error", JSON.stringify({
          track: "gp",
          topic,
          errorType: result.errorType,
          status: result.status,
          requestId: result.requestId,
          attempts: result.attempts,
          message: result.message,
        }));
        results.push({ topic, track: "gp", status: "error", errorType: result.errorType, requestId: result.requestId, attempts: result.attempts });
        continue;
      }

      try {
        const rows = result.data.map((q: any) => ({
          broad_topic: q.broad_topic, topic: q.topic, q: q.q,
          options: q.options, answer: q.answer.charAt(0),
          explanation: q.explanation, difficulty: q.difficulty,
          source: q.source, is_active: q.is_active,
        }));
        await dbInsert("gp_questions", rows);
        await log("success", `GP: 5 questions for ${topic}`);
        results.push({ topic, track: "gp", status: "ok" });
      } catch (err) {
        await log("error", JSON.stringify({ track: "gp", topic, errorType: "db_or_shape_error", message: String(err) }));
        results.push({ topic, track: "gp", status: "error", errorType: "db_or_shape_error" });
      }
    }

    const succeeded = results.filter((r) => r.status === "ok").length;
    const failed = results.length - succeeded;
    const errorTypes = [...new Set(results.filter((r) => r.status === "error" && r.errorType).map((r) => r.errorType!))];
    const apiOutage = failed > 0 && succeeded === 0;

    const summary = apiOutage
      ? `0 questions generated due to API error (${errorTypes.join(", ") || "unknown"})`
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
      JSON.stringify({ success: false, generated: 0, summary: "0 questions generated due to top-level crash", error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
