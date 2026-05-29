-- Corrects total_attempts inflation caused by the trigger firing
-- during the backfill UPDATE in the previous migration.
-- All pre-migration rows have exactly one historical attempt.

ALTER TABLE public.user_progress DISABLE TRIGGER trg_maintain_progress_summary;

UPDATE public.user_progress
SET
  total_attempts      = 1,
  consecutive_correct = CASE WHEN is_correct THEN 1 ELSE 0 END,
  last_attempt_at     = COALESCE(created_at, now());

ALTER TABLE public.user_progress ENABLE TRIGGER trg_maintain_progress_summary;
