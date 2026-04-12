Deno.serve(async (req) => {
  try {
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

    await log("started", "triggered");

    const TOPICS = ["Cardiology", "Respiratory", "Gastroenterology", "Endocrinology", "Nephrology", "Rheumatology", "Neurology", "Haematology", "Infectious Disease", "Oncology"];
    const results = [];

    for (const subtopic of TOPICS) {
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
            messages: [{ role: "user", content: `Generate exactly 5 flashcards for UAE DOH exam on: ${subtopic}. Respond ONLY with JSON array: [{"card_type":"concept","front":"question","back":"answer","difficulty":"medium","tags":["tag"]}]` }],
          }),
        });

        const claudeData = await claudeRes.json();
        const flashcards = JSON.parse(claudeData.content[0].text.trim());

        const rows = [];
        for (const f of flashcards) {
          rows.push({
            system: "Internal Medicine",
            track: "Specialist",
            subtopic: subtopic,
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

        await log("success", `Done: ${subtopic}`);
        results.push({ subtopic, status: "ok" });

      } catch (err) {
        await log("error", `Failed: ${subtopic} - ${String(err)}`);
        results.push({ subtopic, status: "error" });
      }
    }

    await log("completed", `${results.filter(r => r.status === "ok").length}/10 done`);
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
