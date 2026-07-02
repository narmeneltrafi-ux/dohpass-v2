# Ops log — panel-review fixes applied to live DB (2026-07-01)

Data-only changes applied directly to project `qvzvdwvyihwwiqlhgogq` (not
migrations — data, not schema). Recorded here with reversals.

## 1. Deactivated 20 flagged questions (item #2)

Questions flagged `needs_review = true` were still `is_active = true`, i.e.
possibly-wrong-answer items served to paying users. Deactivated them (14
specialist + 6 GP). `get_question_counts` dropped 2439→2425 specialist,
977→971 GP.

```sql
-- applied
UPDATE specialist_questions SET is_active=false WHERE needs_review=true AND is_active=true;
UPDATE gp_questions         SET is_active=false WHERE needs_review=true AND is_active=true;
```

Reversal (only after the flagged items are actually reviewed/corrected):
```sql
-- do NOT blanket-reverse; re-activate per id once fixed, e.g.
-- UPDATE specialist_questions SET is_active=true, needs_review=false WHERE id = '<uuid>';
```

## 2. Triaged 27 stuck review_queue rows (item #3)

`review_queue` had 27 rows stuck in `pending` for a drainer that was never
deployed. Terminated them to `failed` (terminal per the status CHECK) with a
retirement note in `last_error`. See `docs/retired-crons.md`.

```sql
-- applied
UPDATE review_queue
   SET status='failed',
       last_error='Retired 2026-07: review-questions cron decommissioned ...',
       last_attempt_at=now()
 WHERE status='pending';
```
