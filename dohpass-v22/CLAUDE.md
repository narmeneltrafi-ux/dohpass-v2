# DOHPass v2 — Project Context

## Overview

| Field | Value |
|---|---|
| Stack | React + Vite + Supabase |
| Repo | narmeneltrafi-ux/dohpass-v2 |
| Vercel project | dohpass-v2-pthr |
| Supabase project ID | qvzvdwvyihwwiqlhgogq |

## Database Schema

### `specialist_questions`

| Column | Type |
|---|---|
| id | uuid |
| topic | text |
| subtopic | text |
| q | text |
| options | text[] ARRAY |
| answer | text (single uppercase letter) |
| explanation | text |
| difficulty | text |
| source | text |
| is_active | boolean |
| created_at | timestamptz |

### `gp_questions`

Same schema as `specialist_questions`, plus:

| Column | Type |
|---|---|
| broad_topic | text |

## SQL Rules

- Escape single quotes as double single quotes (`''`)
- Options format: `ARRAY['text','text']`
- No A/B/C labels inside option text
- `answer` is a single uppercase letter A–E
- Always include `explanation` with guideline citations

## Question Style

- Full Pearson VUE clinical vignette format
- Single best answer
- 3–5 distractors
- No negative stems

## Revenue Model

**Manual only. No payment processor. Permanently.**
Access is granted via SQL after bank transfer / Wise / cash confirmation:
```sql
UPDATE profiles
SET is_paid = true, plan = 'specialist', access_expires_at = now() + interval '30 days'
WHERE email = 'user@example.com';
```

Do NOT suggest Stripe, Paddle, Lemon Squeezy, or any payment processor.

### `profiles` access columns

| Column | Purpose |
|---|---|
| `is_paid` | boolean — set true on manual grant |
| `plan` | `'free'` \| `'gp'` \| `'specialist'` \| `'all_access'` |
| `access_expires_at` | **Manual bank transfer expiry** — this is the authoritative field for manual grants |
| `current_period_end` | Stripe artifact — legacy only, do not use for manual grants |
| `grace_period_end` | Stripe grace period fallback — do not use for manual grants |

`hasAccess(profile)` checks in order: `access_expires_at` → `is_paid` → `grace_period_end`.
For manual grants, only `access_expires_at` matters.

## Pending Work

- [x] Progress tracking — ProgressPage rewritten with design system + answered_at bug fixed
- [ ] Bare domain fix: `dohpass.com` A record → `216.198.79.1`

## Progress Tracking Architecture

### `question_attempts` (append-only — source of truth)
Every answer submission appends a row here — never overwritten.
Use this table for SRS scheduling, adaptive question selection, performance trajectory, and pass prediction.

| Column | Notes |
|---|---|
| `response_time_ms` | Milliseconds from question display to submit; `NULL` for data backfilled before this feature |
| `track` | `'specialist'` \| `'gp'` |

### `user_progress` (latest-state cache — fast reads)
One row per `(user_id, question_id)` — always the most recent attempt.
Use this for dashboard stats, weekly counts, topic accuracy, and streak calculations.
A DB trigger (`trg_maintain_progress_summary`) auto-maintains the summary columns on every write — **never set them manually**.

| Column | Maintained by |
|---|---|
| `total_attempts` | trigger — increments on every upsert |
| `consecutive_correct` | trigger — resets to 0 on wrong, increments on correct |
| `last_attempt_at` | trigger — always `now()` at write time |
| `created_at` | application — timestamp of first attempt only |

- `track` values: `'specialist'` \| `'gp'`
- Timestamp column is `created_at` (NOT `answered_at` — do not select that column)

## Key Invariants

- `resolveCorrectIndex(options, answer)` in `src/lib/resolveCorrectIndex.js` — single source of truth for scoring; always use it, never inline letter comparison
- `hasAccess(profile)` in `src/lib/supabase.js` — single gate for paid content; never bypass
- `SELF_CHROMED_PATHS` in `src/App.jsx` — routes that suppress the global Header (they ship their own nav via AppNav or LandingNav)
