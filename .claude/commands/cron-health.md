# /cron-health

Confirm the DOHPass autopilot content pipeline is alive. Quick daily/weekly check.

## Context

DOHPass runs 4 cron jobs (UTC) that keep content fresh and the database warm:
- 01:00 `keep-alive` — pings DB to prevent cold starts
- 02:00 `generate-questions` — v34 prompt, 20 questions/day, batch_size 4
- 03:00 `review-questions` — flags weak questions, edits the rest
- 04:00 `generate-flashcards` — produces flashcards from approved questions

If any cron fails silently, content stops growing. Catch it within 24h, not 7 days.

## What to do

1. **Check last 24h of logs** for each cron via Supabase MCP `get_logs` with service `edge-function`:
   - keep-alive: should have at least 1 successful run
   - generate-questions: should show ~20 questions inserted, no timeout errors
   - review-questions: should show ~95% pass rate, deactivations counted
   - generate-flashcards: should show flashcards inserted

2. **Check question bank deltas** via `execute_sql`:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE is_active = true) AS active_total,
     COUNT(*) FILTER (WHERE is_active = true AND track = 'specialist') AS active_specialist,
     COUNT(*) FILTER (WHERE is_active = true AND track = 'gp') AS active_gp,
     COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS added_24h,
     COUNT(*) FILTER (WHERE updated_at > now() - interval '24 hours' AND is_active = false) AS deactivated_24h
   FROM questions;
   ```

3. **Check flashcard deltas** similarly.

4. **Check for stuck pending questions:**
   ```sql
   SELECT track, COUNT(*) FROM questions
   WHERE status = 'pending' AND created_at < now() - interval '48 hours'
   GROUP BY track;
   ```
   Anything > 0 means review-questions is failing on those rows.

5. **Output report:**

```
# Cron Health — <date>

## Verdict: ✅ HEALTHY  /  ⚠️ DEGRADED  /  ❌ DOWN

## Last 24h activity
| Cron | Last run | Status | Output |
|---|---|---|---|
| keep-alive | 01:00 UTC | ✅ | DB warm |
| generate-questions | 02:00 UTC | ✅ | +20 questions |
| review-questions | 03:00 UTC | ✅ | 19 passed, 1 deactivated |
| generate-flashcards | 04:00 UTC | ⚠️ | Timed out after 145s |

## Bank state
- Active total: X (Specialist Y / GP Z)
- Added in 24h: X
- Deactivated in 24h: X
- Stuck in pending >48h: X

## Anomalies
- [list any: timeouts, error rates, missing runs, stuck pending]

## Recommended actions
1. [if any]
```

## Hard Rules

- Never auto-restart a failing cron without telling Huzaifa first
- If `keep-alive` failed >2 days, the DB may have cold-started — flag for manual check
- If `generate-questions` produced 0 new questions in 48h, the prompt or model endpoint is likely broken — investigate
- If `review-questions` deactivation rate >10%, something in the generation prompt regressed — flag for prompt review
