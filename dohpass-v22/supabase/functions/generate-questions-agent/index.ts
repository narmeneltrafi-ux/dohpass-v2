// supabase/functions/generate-questions-agent/index.ts
//
// God Mode — Question Writer Agent (admin-only).
// Two-pass pipeline:
//   PASS 1  GENERATE   — Chief Medical Content Officer writes N candidate items
//                        to NBME one-best-answer standard (Oct 2024 guide) + DOH house rules.
//   PASS 2  REVIEW     — Adversarial Board Examiner attacks each item, returns
//                        verdict PASS | EDIT | REJECT with a flaw report.
//
// Returns the reviewed candidates as JSON. NO database write happens here —
// the frontend stages PASS items as drafts (is_active=false) on explicit user action.
//
// Security: verify_jwt=false in config.toml; this function re-checks is_admin
// server-side via the service role. No client can bypass it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SERVICE_ROLE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MODEL = 'claude-sonnet-4-6'
const MAX_BATCH = 4 // hard cap — 150s edge wall-clock

const CORS = {
  'Access-Control-Allow-Origin': 'https://dohpass.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — PASS 1: GENERATOR (Chief Medical Content Officer)
// ──────────────────────────────────────────────────────────────────────────
function generatorSystem(track: string): string {
  const trackLine = track === 'gp'
    ? `TRACK: GP (General Practice). Primary-care presentations, common conditions, when-to-refer judgement, family-medicine context. Vignettes tighter (60–110 words).`
    : `TRACK: Specialist (Internal Medicine). Registrar/consultant-level reasoning, subspecialty management depth, guideline-driven decisions. Vignettes 80–150 words.`

  return `You are the Chief Medical Content Officer for DOHPass, an exam-prep platform for the UAE Department of Health (DOH Abu Dhabi) physician licensing examination, delivered via Pearson VUE.

You write SINGLE-BEST-ANSWER multiple-choice items to the NBME Item-Writing Guide standard (October 2024 edition). The DOH exam uses the one-best-answer (A-type) format. You are not a tutor and not a textbook. You write defensible, exam-grade items only.

${trackLine}

NON-NEGOTIABLE NBME ONE-BEST-ANSWER RULES:
1. FOCUS ON AN IMPORTANT CONCEPT. No trivia. The item must test something a competent physician must know.
2. ASSESS APPLICATION, NOT RECALL. The vignette must require reasoning (diagnosis, next investigation, best management, mechanism applied to THIS patient) — never isolated fact retrieval.
3. CLOSED, FOCUSED LEAD-IN — pass the "cover-the-options" test: a knowledgeable candidate should be able to answer from the vignette + lead-in ALONE, before seeing options. If the item only makes sense once options are visible, it is broken.
4. HOMOGENEOUS, PLAUSIBLE OPTIONS. All five options must be the same category (all diagnoses, OR all investigations, OR all drugs — never mixed) and rank-orderable on a single dimension. Distractors may be partially correct but the keyed answer is unambiguously the BEST. Every distractor must be a mistake a real candidate could plausibly make.
5. FLAW-FREE. Remove anything that cues the test-wise candidate or adds irrelevant difficulty.

ABSOLUTELY FORBIDDEN:
- "All of the above" / "None of the above"
- "...EXCEPT" / "Which is NOT" / negative stems
- "Which of the following statements is true?" (low cognitive level)
- Vague qualifiers in stem or options: "may", "could be", "usually", "frequently", "is associated with", "is useful for", "is important"
- The answer being cued in the stem (e.g. listing a classic triad then asking the diagnosis)
- Heterogeneous options that cannot be rank-ordered
- The keyed answer being noticeably longer or more detailed than distractors (length giveaway)
- Grammatical giveaways (a/an agreement, singular/plural mismatch between lead-in and options)
- Niche zebras a working physician would never independently diagnose
- Fabricated trials, fabricated guideline citations, or invented year-specific claims. If unsure of a citation, write "verify against current guideline" — never invent one.

CLINICAL & REGIONAL STANDARD:
- UAE context where natural (Emirati names acceptable, local epidemiology for ID).
- Cite real guideline bodies by name when relevant: ESC, ADA, NICE, KDIGO, GOLD, IDSA, MOHAP/DOH UAE. For oncology: ASCO/ESMO/NCCN, and never state a regimen without "verify dosing per local protocol".
- Avoid date-stamped phrasing ("2024 guideline"); prefer "per current ESC guidance".
- Realistic, slightly atypical presentations preferred over textbook caricatures — test reasoning, not pattern-matching.

EXPLANATION REQUIREMENTS (must teach, not just justify):
- One to two sentences on WHY the keyed answer is correct (mechanism or guideline).
- One line per distractor explaining why it is inferior/wrong (distractor-by-distractor).
- One "key learning point" sentence: what the item is really testing.

OUTPUT — return ONLY valid JSON, no prose, no markdown fences. Exactly this shape:
{
  "items": [
    {
      "topic": "string (system, e.g. Cardiology)",
      "subtopic": "string (specific topic, e.g. Acute coronary syndrome)",
      "difficulty": "Easy | Moderate | Hard",
      "vignette": "string",
      "lead_in": "string ending in '?'",
      "options": ["A. ...","B. ...","C. ...","D. ...","E. ..."],
      "answer": "single uppercase letter A-E",
      "explanation": "Why correct: ... Why A wrong: ... Why B wrong: ... Why C wrong: ... Why D wrong: ... Why E wrong: ... Key learning point: ...",
      "citation": "guideline body + context, or 'general internal medicine'"
    }
  ]
}
Options must be prefixed "A. " … "E. " and ordered alphabetically/logically (e.g. doses ascending), never randomly. Produce exactly the number of items requested.`
}

// ──────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — PASS 2: ADVERSARIAL REVIEWER (Board Examiner)
// ──────────────────────────────────────────────────────────────────────────
const REVIEWER_SYSTEM = `You are a senior medical board examiner and psychometrician reviewing draft single-best-answer items for a high-stakes physician licensing exam (UAE DOH, Pearson VUE delivery). Your job is to ATTACK each item and find every flaw. You are adversarial by design. Assume the writer is over-confident. A single defensible second answer, or one fabricated citation, fails the item.

Apply the NBME technical-flaw taxonomy (Oct 2024 guide) plus known failure modes. For EACH item, check:

A. TWO DEFENSIBLE ANSWERS (most important). Could a strong candidate justify a second option as correct or equally best? If yes -> fail.
B. COVER-THE-OPTIONS. Is the item answerable from vignette + lead-in alone? If it needs the options to make sense -> fail.
C. ANSWER CUED IN STEM. Does the vignette over-specify and give away the key?
D. HETEROGENEOUS OPTIONS. Are all five the same category and rank-orderable on one dimension?
E. LENGTH / GRAMMAR GIVEAWAY. Is the key conspicuously longer? Any a/an or singular/plural cue?
F. RECALL-ONLY. Does it test application/analysis, or just memory of a fact?
G. VAGUE TERMS. Any "may / could / usually / frequently / associated with" in stem or options?
H. FABRICATED OR WRONG CITATION. Is any trial/guideline/year invented or misattributed? Is the clinical content actually correct per current guidelines?
I. NICHE ZEBRA. Is this something a working physician would realistically need to know?
J. CLINICAL ACCURACY. Is the keyed answer genuinely correct? Is the explanation's reasoning sound?

VERDICT RULES:
- PASS: zero flaws across A-J; clinically correct; defensible in front of a review panel.
- EDIT: fundamentally sound but has a fixable flaw (wording, one weak distractor, length). Provide a corrected version.
- REJECT: two defensible answers, clinically wrong, fabricated citation, or unfixable structure.

When verdict is EDIT, return the FULL corrected item in "revised" using the identical item schema (topic, subtopic, difficulty, vignette, lead_in, options, answer, explanation, citation). When PASS or REJECT, "revised" is null.

OUTPUT — return ONLY valid JSON, no prose, no markdown fences:
{
  "reviews": [
    {
      "index": 0,
      "verdict": "PASS | EDIT | REJECT",
      "flaws": ["short string per flaw found, empty array if none"],
      "clinical_note": "one line on clinical accuracy / guideline alignment",
      "revised": null
    }
  ]
}
Return one review object per input item, in the same order, with matching "index".`

// ──────────────────────────────────────────────────────────────────────────
// Anthropic call helper
// ──────────────────────────────────────────────────────────────────────────
async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Anthropic ${res.status}: ${t}`)
  }
  const data = await res.json()
  const text = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
  return text
}

// Strip accidental code fences, parse JSON safely.
function parseJson(raw: string): any {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  return JSON.parse(cleaned)
}

// ──────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { userId, track, topic, subtopic, difficulty, count } = body
  if (!userId) return json({ error: 'userId required' }, 400)
  if (track !== 'specialist' && track !== 'gp') return json({ error: 'track must be specialist|gp' }, 400)
  if (!topic) return json({ error: 'topic required' }, 400)

  const n = Math.max(1, Math.min(MAX_BATCH, Number(count) || 1))

  const admin = createClient(SB_URL, SB_SERVICE_ROLE_KEY)

  // ── Server-side admin gate (no client bypass) ──
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  if (profErr) return json({ error: 'Profile lookup failed' }, 403)
  if (!profile?.is_admin) return json({ error: 'Admin only' }, 403)

  try {
    // ── PASS 1: GENERATE ──
    const genUser = [
      `Write ${n} single-best-answer item(s).`,
      `Track: ${track}.`,
      `System/topic: ${topic}.`,
      subtopic ? `Subtopic focus: ${subtopic}.` : `Choose high-yield subtopics within ${topic}.`,
      difficulty ? `Target difficulty: ${difficulty}.` : `Mix Moderate and Hard.`,
      `Return exactly ${n} item(s) in the required JSON shape.`,
    ].join(' ')

    const genRaw = await callClaude(generatorSystem(track), genUser, 4000)
    const genParsed = parseJson(genRaw)
    const items = Array.isArray(genParsed.items) ? genParsed.items : []
    if (items.length === 0) throw new Error('Generator returned no items')

    // ── PASS 2: ADVERSARIAL REVIEW ──
    const revUser = `Review these ${items.length} item(s). Be adversarial. Return one review per item in order.\n\n${JSON.stringify({ items }, null, 2)}`
    const revRaw = await callClaude(REVIEWER_SYSTEM, revUser, 3000)
    const revParsed = parseJson(revRaw)
    const reviews = Array.isArray(revParsed.reviews) ? revParsed.reviews : []

    // ── Merge: attach review to each candidate ──
    const merged = items.map((item: any, i: number) => {
      const review = reviews.find((r: any) => r.index === i) ?? reviews[i] ?? null
      const verdict = review?.verdict ?? 'REJECT'
      // EDIT verdicts ship the reviewer's corrected item as the canonical content.
      const final = verdict === 'EDIT' && review?.revised ? review.revised : item
      return {
        candidate: final,
        original: verdict === 'EDIT' ? item : null,
        verdict,
        flaws: review?.flaws ?? [],
        clinical_note: review?.clinical_note ?? '',
      }
    })

    return json({
      track,
      topic,
      subtopic: subtopic ?? null,
      model: MODEL,
      generated_at: new Date().toISOString(),
      count: merged.length,
      pass_count: merged.filter((m: any) => m.verdict === 'PASS').length,
      items: merged,
    })
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})
