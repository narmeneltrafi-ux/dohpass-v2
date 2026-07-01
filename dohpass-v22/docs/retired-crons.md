# Retired content-generation crons (decision, 2026-07)

**Status: intentionally retired — not drift, not an outage.**

The question/flashcard bank was built and audited through the two-pass
generation + review system. It is feature-complete (~2,425 specialist + ~971 GP
active questions, ~1,869 flashcards). The nightly content pipeline has done its
job and is deliberately switched off.

## What this means

- The following pg_cron jobs **do not exist** and are **not** to be recreated:
  - `generate-questions` (was ~02:00 UTC)
  - `review-questions` (was ~03:00 UTC)
  - `generate-flashcards` (was ~04:00 UTC)
- The matching Edge Functions are **retired**. They remain deployed but idle;
  they can be deleted from the Supabase dashboard when convenient
  (`generate-questions`, `review-questions`, `generate-flashcards`). Their
  source is kept in `supabase/functions/` for history.
  - Not retired: `generate-questions-agent` — this backs the live God-Mode
    "Question Writer" admin tool and is invoked on demand, not by cron.
- The `review_queue` drainer described in `review-questions/index.ts` was never
  deployed. As of 2026-07 the 27 rows stuck in `pending` were terminated to
  `failed` (see their `last_error`). The queue is dormant, not live work.

## Live crons that remain (verified 2026-07-01)

| Job | Schedule (UTC) | Purpose |
|-----|----------------|---------|
| `keep-alive` | `0 1 * * *` | Prevents project auto-pause |
| `expire-lapsed-access` | `0 0 * * *` | Re-locks dated access grants |
| `reengagement-emails` | `0 6 * * *` | Day 2/5/10/14 nudge emails |

## If the bank is ever re-audited

Re-triage `review_queue` manually (or truncate it) before standing anything up.
Do not resurrect the commented drainer as-is — it was never load-tested against
the 150s edge-function timeout.
