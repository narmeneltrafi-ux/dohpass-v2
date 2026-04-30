#!/usr/bin/env tsx
// One-off pre-launch bulk review of the active question bank using
// Sonnet 4.6. Standalone — does NOT touch any edge function, cron,
// or production review path. See PR description for rationale.
//
// Run:
//   npx tsx scripts/bulk-review.ts --dry-run --limit 5
//   npx tsx scripts/bulk-review.ts --limit 25
//   npx tsx scripts/bulk-review.ts --yes

import { createClient } from "@supabase/supabase-js";
import { readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotenv() {
  const candidates = [
    join(__dirname, "..", ".env"),
    join(__dirname, "..", "..", ".env"),
    join(process.cwd(), ".env"),
  ];
  for (const path of candidates) {
    try {
      const contents = readFileSync(path, "utf8");
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const k = trimmed.slice(0, eq).trim();
        let v = trimmed.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
      return;
    } catch {/* try next */}
  }
}
loadDotenv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SB_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error(
    "Missing env. Need SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and ANTHROPIC_API_KEY in .env or shell.",
  );
  process.exit(1);
}

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 3000;
const CONCURRENCY = 2;
const PROGRESS_EVERY = 50;
const RETRY_ATTEMPTS = 3;

// Sonnet 4.6 pricing per 1M tokens (USD).
const PRICE_IN_PER_M = 3;
const PRICE_OUT_PER_M = 15;

// CLI flags
const argv = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) return argv[i + 1];
    if (a.startsWith(name + "=")) return a.slice(name.length + 1);
  }
  return undefined;
}
const DRY_RUN = argv.includes("--dry-run");
const SKIP_CONFIRM = argv.includes("--yes");
const LIMIT_RAW = getFlag("--limit");
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : undefined;
const TABLE_FLAG = (getFlag("--table") ?? "both") as "specialist" | "gp" | "both";
if (!["specialist", "gp", "both"].includes(TABLE_FLAG)) {
  console.error(`--table must be specialist|gp|both, got: ${TABLE_FLAG}`);
  process.exit(1);
}

const ERRORS_PATH = join(process.cwd(), "bulk-review-errors.jsonl");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Track = "specialist" | "gp";

const reviewPrompt = (q: any, track: Track) => `You are a senior medical educator and item-writing expert reviewing multiple-choice questions for the UAE DOH ${
  track === "specialist" ? "Internal Medicine Specialist" : "General Practitioner"
} licensing exam. The exam is administered in Pearson VUE format. The platform selling these questions is being launched commercially — the quality bar is "would a senior consultant in this specialty be willing to put their name on this question?"

You will review ONE question. Apply ALL of the following lenses:

## 1. Clinical accuracy (highest priority)
- Is the stated answer actually the best answer per the most current major guideline (2024-2026)?
- Reference the specific guideline (NICE, ESC, ADA, GINA, GOLD, ATS/ERS, WHO, BSH, BTS, KDIGO, EASL, ACG, ESMO, NCCN, etc.) that supports it
- If the question cites a guideline in its explanation, verify the citation is real and current
- Flag any answer that is dangerous, outdated by ≥1 guideline cycle, or where a different option is now preferred per current evidence

## 2. Pearson VUE / item-writing style
The DOH exam follows Pearson VUE conventions. Flag violations:
- Stem must be a clinical vignette with sufficient detail to answer without options (cover-the-options test)
- Single best answer — no "all of the above," "none of the above," "A and C"
- Avoid negative framing ("which is NOT...") unless clearly necessary and capitalized
- Distractors must be plausible and parallel in structure/length
- No clinically irrelevant distractors (obvious wrong answers)
- No "trick" wording or grammatical clues to the correct answer
- Stem should not give the answer away by length, specificity, or including the answer's keyword
- 4-5 options is standard
- Avoid absolutes in distractors ("always," "never") unless the answer itself is an absolute clinical rule

## 3. Question construction quality
- Is the vignette realistic for UAE DOH context? (UAE/Gulf demographics, local guideline emphasis where applicable e.g. DOH/MOH/HAAD protocols)
- Are vital signs, labs, imaging findings internally consistent?
- Is the level of difficulty appropriate (not too easy, not requiring obscure knowledge)?
- Does the stem give just enough info, no more?

## 4. Explanation quality
- Does the explanation teach, not just state the answer?
- Does it briefly address why the wrong options are wrong?
- Is the cited guideline current and accurately quoted?

---

Question to review:

Topic: ${q.topic}
Question: ${q.q}
Options: ${JSON.stringify(q.options)}
Stated Answer: ${q.answer}
Explanation: ${q.explanation}

---

Respond ONLY with a valid JSON object. No preamble, no markdown, no backticks. The JSON must have exactly this shape:

{
  "clinical_accuracy_ok": boolean,
  "guideline_referenced": "name and year of the most current guideline that supports the correct answer (e.g. 'GINA 2025', 'NICE NG145 2023')",
  "pearson_vue_violations": ["list any style violations, empty array if none"],
  "answer_flagged": boolean,
  "answer_flag_reason": "specific reason if flagged, citing the current guideline that contradicts. Null if not flagged.",
  "preferred_answer": "letter of the preferred answer if different from stated, otherwise same letter",
  "changes_made": boolean,
  "q": "improved question stem if changes_made, otherwise original",
  "options": ["improved options if changes_made, otherwise original"],
  "explanation": "improved explanation if changes_made, otherwise original. When changing, write a substantive teaching explanation: why the answer is correct (with current guideline cite), why the key distractors are wrong, and one clinically useful pearl. ~80-150 words.",
  "confidence": "high | medium | low"
}

Rules:
- If clinical_accuracy_ok is false, answer_flagged MUST be true
- If pearson_vue_violations is non-empty AND severity warrants, set changes_made=true and provide a fixed version
- If you are not confident (confidence: low) on a clinical call, set answer_flagged=true and explain the uncertainty in answer_flag_reason — better to flag for human review than to silently approve
- Never invent a guideline reference. If you cannot confidently cite a current guideline, say so in answer_flag_reason and flag for review
- Preserve the original difficulty level. Don't dumb down questions when rewriting.`;

class ClaudeError extends Error {
  status: number | null;
  errorType: string;
  requestId: string | null;
  constructor(message: string, status: number | null, errorType: string, requestId: string | null) {
    super(message);
    this.status = status;
    this.errorType = errorType;
    this.requestId = requestId;
  }
}

interface ClaudeResult {
  parsed: any;
  inputTokens: number;
  outputTokens: number;
  rawText: string;
}

async function callClaudeOnce(prompt: string): Promise<ClaudeResult> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    throw new ClaudeError(String(err), null, "network_error", null);
  }

  const requestId = res.headers.get("request-id") ?? res.headers.get("x-request-id");

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let errorType = `http_${res.status}`;
    let message = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      errorType = parsed?.error?.type ?? errorType;
      message = parsed?.error?.message ?? message;
    } catch {/* leave raw */}
    throw new ClaudeError(message, res.status, errorType, requestId);
  }

  const body: any = await res.json().catch(() => null);
  const text = body?.content?.[0]?.text;
  const inputTokens = body?.usage?.input_tokens ?? 0;
  const outputTokens = body?.usage?.output_tokens ?? 0;
  if (typeof text !== "string") {
    throw new ClaudeError(JSON.stringify(body ?? {}).slice(0, 300), res.status, "malformed_response", requestId);
  }

  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```json?/g, "").replace(/```/g, "").trim();
  }

  try {
    return { parsed: JSON.parse(cleaned), inputTokens, outputTokens, rawText: text };
  } catch (err) {
    throw new ClaudeError(String(err), res.status, "json_parse_error", requestId);
  }
}

async function callWithBackoff(prompt: string): Promise<ClaudeResult> {
  let lastErr: any;
  for (let i = 0; i < RETRY_ATTEMPTS; i++) {
    try {
      return await callClaudeOnce(prompt);
    } catch (e: any) {
      lastErr = e;
      const status = e?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500) || e?.errorType === "network_error";
      if (!retryable || i === RETRY_ATTEMPTS - 1) throw e;
      const base = Math.pow(4, i) * 1000;
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, base + jitter));
    }
  }
  throw lastErr;
}

interface Question {
  id: string;
  topic: string;
  q: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface FetchedRow {
  table: "specialist_questions" | "gp_questions";
  track: Track;
  q: Question;
}

async function fetchPending(): Promise<FetchedRow[]> {
  const tables: Array<{ table: "specialist_questions" | "gp_questions"; track: Track }> = [];
  if (TABLE_FLAG === "specialist" || TABLE_FLAG === "both") {
    tables.push({ table: "specialist_questions", track: "specialist" });
  }
  if (TABLE_FLAG === "gp" || TABLE_FLAG === "both") {
    tables.push({ table: "gp_questions", track: "gp" });
  }

  const out: FetchedRow[] = [];
  for (const { table, track } of tables) {
    // Page through in chunks of 1000 to bypass any default row caps and
    // to keep memory predictable. Apply LIMIT across the whole run, not
    // per-table — when --limit 5 with both tables, we want 5 total.
    let from = 0;
    const pageSize = 1000;
    while (true) {
      if (LIMIT && out.length >= LIMIT) break;
      const { data, error } = await supabase
        .from(table)
        .select("id, topic, q, options, answer, explanation")
        .eq("is_active", true)
        .is("needs_review", null)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Fetch failed for ${table}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const q of data) {
        out.push({ table, track, q: q as Question });
        if (LIMIT && out.length >= LIMIT) break;
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    if (LIMIT && out.length >= LIMIT) break;
  }
  return out;
}

function logErrorRow(entry: any) {
  try {
    appendFileSync(ERRORS_PATH, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("Failed to append error log:", e);
  }
}

interface Stats {
  flagged: number;
  edited: number;
  clean: number;
  errors: number;
  lowConf: number;
  totalIn: number;
  totalOut: number;
  confidence: { high: number; medium: number; low: number; other: number };
  pearsonViolations: Map<string, number>;
}

const stats: Stats = {
  flagged: 0,
  edited: 0,
  clean: 0,
  errors: 0,
  lowConf: 0,
  totalIn: 0,
  totalOut: 0,
  confidence: { high: 0, medium: 0, low: 0, other: 0 },
  pearsonViolations: new Map(),
};

const samples: Array<{ row: FetchedRow; review: any }> = [];

async function reviewOne(row: FetchedRow): Promise<void> {
  const { table, track, q } = row;
  let result: ClaudeResult;
  try {
    result = await callWithBackoff(reviewPrompt(q, track));
  } catch (e: any) {
    stats.errors++;
    logErrorRow({
      ts: new Date().toISOString(),
      table,
      questionId: q.id,
      errorType: e?.errorType ?? "unknown",
      status: e?.status ?? null,
      requestId: e?.requestId ?? null,
      message: e?.message ?? String(e),
    });
    return;
  }

  stats.totalIn += result.inputTokens;
  stats.totalOut += result.outputTokens;

  const review = result.parsed;
  const confidence = String(review?.confidence ?? "").toLowerCase();
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    stats.confidence[confidence]++;
  } else {
    stats.confidence.other++;
  }
  if (confidence === "low") stats.lowConf++;

  const violations: string[] = Array.isArray(review?.pearson_vue_violations) ? review.pearson_vue_violations : [];
  for (const v of violations) {
    const key = String(v).slice(0, 120);
    stats.pearsonViolations.set(key, (stats.pearsonViolations.get(key) ?? 0) + 1);
  }

  if (DRY_RUN && samples.length < 5) {
    samples.push({ row, review });
  }

  // Bucket
  const flagged = review?.answer_flagged === true;
  const changesMade = review?.changes_made === true;

  if (flagged) {
    stats.flagged++;
  } else if (changesMade) {
    stats.edited++;
  } else {
    stats.clean++;
  }

  if (DRY_RUN) return;

  // Apply DB update
  let update: Record<string, any>;
  if (flagged) {
    update = {
      is_active: false,
      needs_review: true,
      review_reason: review?.answer_flag_reason ?? null,
      review_metadata: review,
    };
  } else if (changesMade) {
    update = {
      q: review.q,
      options: review.options,
      explanation: review.explanation,
      needs_review: false,
      review_reason: null,
      review_metadata: review,
    };
  } else {
    update = {
      needs_review: false,
      review_reason: null,
      review_metadata: review,
    };
  }

  const { error } = await supabase.from(table).update(update).eq("id", q.id);
  if (error) {
    stats.errors++;
    logErrorRow({
      ts: new Date().toISOString(),
      table,
      questionId: q.id,
      errorType: "db_update_error",
      message: error.message,
    });
  }
}

async function processWithConcurrency(items: FetchedRow[], n: number, total: number): Promise<void> {
  let cursor = 0;
  let done = 0;
  let lastReportedAt = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await reviewOne(items[idx]);
      done++;
      if (done - lastReportedAt >= PROGRESS_EVERY || done === total) {
        lastReportedAt = done;
        console.log(
          `[${done}/${total}] flagged: ${stats.flagged} | edited: ${stats.edited} | clean: ${stats.clean} | errors: ${stats.errors} | low-conf: ${stats.lowConf}`,
        );
      }
    }
  });
  await Promise.all(workers);
}

function estimateCost(numQuestions: number) {
  // Rough: ~1300 input tokens / Q (system prompt + question), ~900 output / Q.
  const inTok = numQuestions * 1300;
  const outTok = numQuestions * 900;
  const cost = (inTok / 1_000_000) * PRICE_IN_PER_M + (outTok / 1_000_000) * PRICE_OUT_PER_M;
  return { inTok, outTok, cost };
}

function actualCost() {
  const cost = (stats.totalIn / 1_000_000) * PRICE_IN_PER_M + (stats.totalOut / 1_000_000) * PRICE_OUT_PER_M;
  return cost;
}

function topViolations(n: number): Array<[string, number]> {
  return [...stats.pearsonViolations.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function awaitEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  console.log(`Fetching pending questions (table=${TABLE_FLAG}${LIMIT ? `, limit=${LIMIT}` : ""})...`);
  const items = await fetchPending();
  const total = items.length;
  if (total === 0) {
    console.log("No pending questions found (is_active=true AND needs_review IS NULL).");
    return;
  }

  const est = estimateCost(total);
  const banner = `\n${"=".repeat(72)}\nBULK REVIEW${DRY_RUN ? " (DRY-RUN — no DB writes)" : ""} — ${MODEL} — ${total} questions — est. cost $${est.cost.toFixed(2)}\n${"=".repeat(72)}\n`;
  console.log(banner);
  console.log(`Concurrency: ${CONCURRENCY}  |  max_tokens: ${MAX_TOKENS}  |  errors → ${ERRORS_PATH}`);

  if (!SKIP_CONFIRM) {
    process.stdout.write("ENTER to continue, Ctrl-C to abort > ");
    await awaitEnter();
  }

  const startedAt = Date.now();
  await processWithConcurrency(items, CONCURRENCY, total);
  const elapsedMs = Date.now() - startedAt;

  console.log(`\n${"=".repeat(72)}\nFINAL TALLY\n${"=".repeat(72)}`);
  console.log(`Reviewed: ${total}  (elapsed: ${(elapsedMs / 1000).toFixed(1)}s)`);
  console.log(`  flagged (deactivated): ${stats.flagged}`);
  console.log(`  edited:                ${stats.edited}`);
  console.log(`  clean:                 ${stats.clean}`);
  console.log(`  errors:                ${stats.errors}`);
  console.log(`  low-confidence:        ${stats.lowConf}`);
  console.log(`\nConfidence:  high=${stats.confidence.high}  medium=${stats.confidence.medium}  low=${stats.confidence.low}  other=${stats.confidence.other}`);
  console.log(`Tokens:      input=${stats.totalIn.toLocaleString()}  output=${stats.totalOut.toLocaleString()}`);
  console.log(`Actual cost: $${actualCost().toFixed(4)}`);

  const top = topViolations(5);
  if (top.length > 0) {
    console.log(`\nTop 5 Pearson VUE violations:`);
    for (const [v, c] of top) {
      console.log(`  ${c.toString().padStart(4)} × ${v}`);
    }
  } else {
    console.log(`\nNo Pearson VUE violations recorded.`);
  }

  if (DRY_RUN && samples.length > 0) {
    console.log(`\n${"=".repeat(72)}\nDRY-RUN SAMPLES (first ${samples.length})\n${"=".repeat(72)}`);
    samples.forEach((s, i) => {
      console.log(`\n--- SAMPLE ${i + 1} (${s.row.track} | id=${s.row.q.id} | topic=${s.row.q.topic}) ---`);
      console.log(`Original Q: ${s.row.q.q}`);
      console.log(`Original options: ${JSON.stringify(s.row.q.options)}`);
      console.log(`Original answer: ${s.row.q.answer}`);
      console.log(`Original explanation: ${s.row.q.explanation}`);
      console.log(`\nSonnet review JSON:`);
      console.log(JSON.stringify(s.review, null, 2));
    });
  }

  if (stats.errors > 0) {
    console.log(`\nErrors written to: ${ERRORS_PATH}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
