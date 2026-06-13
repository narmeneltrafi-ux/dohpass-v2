// blueprint-analysis
// Admin-only content-coverage agent. Compares the live question bank against
// blueprint targets (per topic) and asks Claude to act as Chief Medical Content
// Officer — surfacing gaps, over-investment, and a concrete write order.
//
// Auth model mirrors ai-tutor: gateway JWT verification is OFF (the Edge
// Functions gateway rejects HS256 on this project), so the caller is verified
// in-function via GoTrue. This function additionally gates on profiles.is_admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY   = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL        = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";

const MODEL = "claude-sonnet-4-6";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.dohpass.com")
  .split(",").map((s) => s.trim()).filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin  = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
type SvcClient = ReturnType<typeof createClient>;

interface CoverageRow {
  r_topic:       string;
  r_current_q:   number;
  r_target:      number;
  r_gap:         number;
  r_pct:         number;
  r_is_estimate: boolean;
}

// Targets are blueprint ESTIMATES — DOH publishes no official topic weights, so
// every number here is our best inference from past papers and topic frequency.
// Anything ≥ 100% is over-investment to redeploy, not a gap to fill.
const CMCO_SYSTEM =
  "You are the Chief Medical Content Officer for DOHPass, a UAE DOH licensing-exam " +
  "prep platform. You own the question bank's coverage strategy.\n\n" +
  "Critical framing:\n" +
  "- The per-topic targets are BLUEPRINT ESTIMATES. The DOH publishes no official " +
  "topic weights; targets are inferred from past papers and clinical frequency. " +
  "Treat them as directional, not exact.\n" +
  "- Coverage > 100% means OVER-INVESTMENT (write effort better spent elsewhere), " +
  "not a gap.\n" +
  "- You are advising a solo founder writing questions by hand. Be ruthless about " +
  "prioritisation and concrete about what to write next.";

async function callClaude(
  system: string,
  userText: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude error ${res.status}: ${errText.slice(0, 200)}`);
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await res.json();
  return (data.content as { type: string; text: string }[])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function renderTable(rows: CoverageRow[]): string {
  const lines = rows.map((r) =>
    `${r.r_topic}: ${r.r_current_q}/${r.r_target} questions ` +
    `(${r.r_pct}%, gap ${r.r_gap})${r.r_is_estimate ? " [est]" : ""}`
  );
  return lines.join("\n");
}

async function getCoverage(track: string, svc: SvcClient): Promise<CoverageRow[]> {
  const { data, error } = await svc.rpc("get_blueprint_coverage", { p_track: track });
  if (error) throw new Error(`coverage RPC error: ${error.message}`);
  return (data ?? []) as CoverageRow[];
}

function totals(rows: CoverageRow[]) {
  const totalCurrent = rows.reduce((s, r) => s + (r.r_current_q ?? 0), 0);
  const totalTarget  = rows.reduce((s, r) => s + (r.r_target ?? 0), 0);
  const overallPct   = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  return { totalCurrent, totalTarget, overallPct };
}

async function runFull(
  track: string,
  svc: SvcClient,
  cors: Record<string, string>,
): Promise<Response> {
  const rows = await getCoverage(track, svc);
  const { totalCurrent, totalTarget, overallPct } = totals(rows);
  const trackLabel = track === "gp" ? "General Practice (GP)" : "Internal Medicine Specialist";

  const userText =
    `Track: ${trackLabel}\n` +
    `Overall coverage: ${totalCurrent}/${totalTarget} questions (${overallPct}%)\n\n` +
    `## Coverage by topic\n${renderTable(rows)}\n\n` +
    `Analyse this coverage and respond with these sections (use "## " headers):\n` +
    `## CRITICAL GAPS\nTopics dangerously under-covered (lowest %, highest exam weight). ` +
    `Name them with current/target numbers.\n` +
    `## STRATEGIC GAPS\nTopics that are partial and worth filling next, with rationale.\n` +
    `## OVER-INVESTMENT\nTopics at/over 100% where further writing is wasted effort.\n` +
    `## ACTION PLAN\nA concrete ordered list of what to write next and roughly how many.\n` +
    `## FOUNDER CHALLENGE\nOne hard question that challenges the founder's current strategy.\n\n` +
    `Use bullet points within sections. Be specific and use the real numbers above.`;

  const analysis = await callClaude(CMCO_SYSTEM, userText, 1200);

  return new Response(
    JSON.stringify({ analysis, meta: { totalCurrent, totalTarget, overallPct } }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}

async function runDrilldown(
  track: string,
  topic: string,
  svc: SvcClient,
  cors: Record<string, string>,
): Promise<Response> {
  const rows = await getCoverage(track, svc);
  const row  = rows.find((r) => r.r_topic === topic);
  if (!row) return jsonError(`Topic "${topic}" not found in ${track} coverage`, 404, cors);

  const trackLabel = track === "gp" ? "General Practice (GP)" : "Internal Medicine Specialist";

  const userText =
    `Track: ${trackLabel}\n` +
    `Topic: ${row.r_topic}\n` +
    `Current coverage: ${row.r_current_q}/${row.r_target} questions ` +
    `(${row.r_pct}%, gap ${row.r_gap})${row.r_is_estimate ? " — target is an estimate" : ""}\n\n` +
    `Produce a focused build plan for THIS topic with these sections (use "## " headers):\n` +
    `## GAP ASSESSMENT\nHow serious is this gap and why it matters for the exam.\n` +
    `## HIGH-YIELD SUBTOPICS\nExactly 5 subtopics, each with a suggested question count. ` +
    `The counts should sum to roughly the gap of ${row.r_gap}.\n` +
    `## QUALITY WATCH\nCommon pitfalls when writing questions in this area.\n` +
    `## WRITE ORDER\nThe exact sequence to write them in, highest yield first.\n\n` +
    `Use bullet points within sections. Be specific to ${row.r_topic}.`;

  const analysis = await callClaude(CMCO_SYSTEM, userText, 800);

  return new Response(
    JSON.stringify({ analysis, row }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Auth — in-function GoTrue
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) return jsonError("Unauthorized", 401, cors);

    const svc = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

    // 2. Admin gate
    const { data: profile } = await svc
      .from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_admin) return jsonError("Forbidden: admin only", 403, cors);

    // 3. Parse body
    let body: { mode?: string; track?: string; topic?: string };
    try { body = await req.json(); }
    catch { return jsonError("Invalid JSON", 400, cors); }

    const track = body.track === "gp" ? "gp" : "specialist";
    const mode  = body.mode ?? "full";

    if (mode === "drilldown") {
      if (!body.topic) return jsonError("topic required for drilldown", 400, cors);
      return await runDrilldown(track, body.topic, svc, cors);
    }

    return await runFull(track, svc, cors);
  } catch (err) {
    console.error("blueprint-analysis error:", err);
    return jsonError("Internal error generating analysis", 500, cors);
  }
});
