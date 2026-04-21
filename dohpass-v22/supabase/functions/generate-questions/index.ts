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

  const callClaude = async (prompt: string) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    const data = await res.json();
    let text = data.content[0].text.trim();
    if (text.startsWith("```")) text = text.replace(/```json?/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);
  };

  await log("started", "Function triggered");

  const SPECIALIST_TOPICS = ["Cardiology","Respiratory","Gastroenterology","Endocrinology","Nephrology","Rheumatology","Neurology","Haematology","Infectious Disease","Oncology"];
  const GP_TOPICS_A = ["Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD","Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression","Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease","GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations","Emergency Chest Pain","Pharmacology and Prescribing"];
  const GP_TOPICS_B = ["Cardiology GP","Respiratory GP","Gastroenterology GP","Endocrinology GP","Nephrology GP","Neurology GP","Haematology GP","Infectious Disease GP","Oncology Red Flags","Ophthalmology","ENT","Dermatology","Psychiatry","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology","Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations","Preventive Medicine","Public Health","Dementia","Osteoarthritis"];

  const today = new Date().getDate();
  const gpTopics = today % 2 !== 0 ? GP_TOPICS_A : GP_TOPICS_B;
  const results = [];

  try {
    for (const topic of SPECIALIST_TOPICS) {
      try {
        const questions = await callClaude(`You are an expert medical educator for the DOH UAE Internal Medicine Specialist exam. Generate exactly 5 high-quality MCQs on: ${topic}. Respond ONLY with a valid JSON array, no markdown, no backticks: [{"topic":"${topic}","subtopic":"subtopic","q":"question","options":["A. opt1","B. opt2","C. opt3","D. opt4"],"answer":"A","explanation":"explanation"}]`);
        const rows = questions.map((q: any) => ({
          topic: q.topic, subtopic: q.subtopic, q: q.q,
          options: q.options, answer: q.answer.charAt(0), explanation: q.explanation,
        }));
        await dbInsert("specialist_questions", rows);
        await log("success", `Specialist: 5 questions for ${topic}`);
        results.push({ topic, track: "specialist", status: "ok" });
      } catch (err) {
        await log("error", `Specialist failed for ${topic}: ${String(err)}`);
        results.push({ topic, track: "specialist", status: "error" });
      }
    }

    for (const topic of gpTopics) {
      try {
        const questions = await callClaude(`You are an expert medical educator for the DOH UAE GP exam, Pearson VUE style. Generate exactly 5 clinical vignette MCQs on: ${topic}. Follow UAE/DOH/NICE/WHO guidelines. Respond ONLY with a valid JSON array, no markdown, no backticks: [{"broad_topic":"category","topic":"${topic}","q":"vignette","options":["A. opt1","B. opt2","C. opt3","D. opt4"],"answer":"A","explanation":"explanation","difficulty":"medium","source":"DOH Guidelines","is_active":true}]`);
        const rows = questions.map((q: any) => ({
          broad_topic: q.broad_topic, topic: q.topic, q: q.q,
          options: q.options, answer: q.answer.charAt(0),
          explanation: q.explanation, difficulty: q.difficulty,
          source: q.source, is_active: q.is_active,
        }));
        await dbInsert("gp_questions", rows);
        await log("success", `GP: 5 questions for ${topic}`);
        results.push({ topic, track: "gp", status: "ok" });
      } catch (err) {
        await log("error", `GP failed for ${topic}: ${String(err)}`);
        results.push({ topic, track: "gp", status: "error" });
      }
    }

    const succeeded = results.filter(r => r.status === "ok").length;
    await log("completed", `Done. ${succeeded}/${results.length} succeeded`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    await log("error", `Top level crash: ${String(err)}`);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
