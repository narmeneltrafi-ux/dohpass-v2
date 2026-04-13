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

  const SPECIALIST_TOPICS = ["Cardiology","Respiratory","Gastroenterology","Endocrinology","Nephrology","Rheumatology","Neurology","Haematology","Infectious Disease","Oncology"];
  const GP_TOPICS_A = ["Hypertension","Diabetes Type 2","Dyslipidaemia","Thyroid Disorders","Asthma","COPD","Ischaemic Heart Disease","Heart Failure","Atrial Fibrillation","UTI","Anaemia","Depression","Anxiety","Epilepsy","Stroke and TIA","Osteoporosis","Rheumatoid Arthritis","Peptic Ulcer Disease","GERD","Contraception","Antenatal Care","Paediatric Common Illnesses","Vaccinations","Emergency Chest Pain","Pharmacology and Prescribing"];
  const GP_TOPICS_B = ["Cardiology GP","Respiratory GP","Gastroenterology GP","Endocrinology GP","Nephrology GP","Neurology GP","Haematology GP","Infectious Disease GP","Oncology Red Flags","Ophthalmology","ENT","Dermatology","Psychiatry","Obstetrics and Gynaecology","Paediatrics","Orthopaedics and MSK","Urology","Emergency Medicine GP","Geriatrics","Palliative Care","Radiology and Investigations","Preventive Medicine","Public Health","Dementia","Osteoarthritis"];

  const today = new Date().getDate();
  const gpTopics = today % 2 !== 0 ? GP_TOPICS_A : GP_TOPICS_B;
  const results = [];

  await log("started", "generate-flashcards triggered");

  try {
    // Specialist flashcards
    for (const subtopic of SPECIALIST_TOPICS) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{ role: "user", content: `Return ONLY a JSON array with exactly 5 objects. No explanation, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ]. Topic: ${subtopic}. Each object: {"card_type":"concept","front":"question here","back":"answer here","difficulty":"medium","tags":["tag1"]}` }],
          }),
        });
        const claudeData = await claudeRes.json();
        let rawText = claudeData.content[0].text.trim();
        if (rawText.startsWith("```")) rawText = rawText.replace(/```json?/g, "").replace(/```/g, "").trim();
        const parsedCards = JSON.parse(rawText);

        const rows = [];
        for (const f of parsedCards) {
          rows.push({
            system: "Internal Medicine",
            track: "Specialist",
            subtopic,
            card_type: f.card_type,
            front: f.front,
            back: f.back,
            difficulty: f.difficulty,
            tags: f.tags,
            is_active: true,
          });
        }

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

        await log("success", `Specialist: Done: ${subtopic}`);
        results.push({ subtopic, track: "specialist", status: "ok" });

      } catch (err) {
        await log("error", `Specialist failed: ${subtopic} - ${String(err)}`);
        results.push({ subtopic, track: "specialist", status: "error" });
      }
    }

    // GP flashcards
    for (const subtopic of gpTopics) {
      try {
        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{ role: "user", content: `Return ONLY a JSON array with exactly 5 objects. No explanation, no markdown, no backticks. Just the raw JSON array starting with [ and ending with ]. This is for UAE DOH GP exam. Topic: ${subtopic}. Each object: {"card_type":"concept","front":"question here","back":"answer here","difficulty":"medium","tags":["tag1"]}` }],
          }),
        });
        const claudeData = await claudeRes.json();
        let rawText = claudeData.content[0].text.trim();
        if (rawText.startsWith("```")) rawText = rawText.replace(/```json?/g, "").replace(/```/g, "").trim();
        const parsedCards = JSON.parse(rawText);

        const rows = [];
        for (const f of parsedCards) {
          rows.push({
            system: "Primary Care",
            track: "GP",
            subtopic,
            card_type: f.card_type,
            front: f.front,
            back: f.back,
            difficulty: f.difficulty,
            tags: f.tags,
            is_active: true,
          });
        }

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

        await log("success", `GP: Done: ${subtopic}`);
        results.push({ subtopic, track: "gp", status: "ok" });

      } catch (err) {
        await log("error", `GP failed: ${subtopic} - ${String(err)}`);
        results.push({ subtopic, track: "gp", status: "error" });
      }
    }

    await log("completed", `${results.filter(r => r.status === "ok").length}/${results.length} done`);
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    await log("error", `Crash: ${String(err)}`);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
