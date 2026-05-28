-- ============================================================
-- DOHPass — Question Attempts + Progress Summary
-- Replaces single-attempt overwrite with append-only history.
--
-- Before: user_progress upsert destroyed prior attempt data.
-- After:  every answer appended to question_attempts;
--         user_progress kept as a fast "latest state" cache
--         enriched with total_attempts, consecutive_correct,
--         and last_attempt_at for SRS and adaptive algorithms.
-- ============================================================


-- ── 1. QUESTION_ATTEMPTS TABLE (append-only) ─────────────────

CREATE TABLE IF NOT EXISTS public.question_attempts (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id       uuid        NOT NULL,
  track             text        NOT NULL CHECK (track IN ('specialist', 'gp')),
  topic             text,
  is_correct        boolean     NOT NULL,
  selected_answer   text,
  correct_answer    text,
  response_time_ms  integer     CHECK (response_time_ms IS NULL OR response_time_ms > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_attempts_user_id
  ON public.question_attempts (user_id);

CREATE INDEX IF NOT EXISTS idx_question_attempts_user_question
  ON public.question_attempts (user_id, question_id);

CREATE INDEX IF NOT EXISTS idx_question_attempts_created_at
  ON public.question_attempts (created_at);

ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_attempts: select own" ON public.question_attempts;
CREATE POLICY "question_attempts: select own"
  ON public.question_attempts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_attempts: insert own" ON public.question_attempts;
CREATE POLICY "question_attempts: insert own"
  ON public.question_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE — this table is intentionally append-only.

GRANT SELECT, INSERT ON public.question_attempts TO authenticated;
GRANT ALL            ON public.question_attempts TO service_role;


-- ── 2. ENRICH USER_PROGRESS WITH SUMMARY COLUMNS ─────────────

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS total_attempts      integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS consecutive_correct integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at     timestamptz NOT NULL DEFAULT now();


-- ── 3. TRIGGER: AUTO-MAINTAIN SUMMARY COLUMNS ────────────────
-- Fires BEFORE INSERT OR UPDATE so the values are correct in
-- the same transaction — no second round-trip needed.

CREATE OR REPLACE FUNCTION public.maintain_progress_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.total_attempts      := 1;
    NEW.consecutive_correct := CASE WHEN NEW.is_correct THEN 1 ELSE 0 END;
    NEW.last_attempt_at     := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.total_attempts      := OLD.total_attempts + 1;
    NEW.consecutive_correct := CASE
      WHEN NEW.is_correct THEN OLD.consecutive_correct + 1
      ELSE 0
    END;
    NEW.last_attempt_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_progress_summary ON public.user_progress;
CREATE TRIGGER trg_maintain_progress_summary
  BEFORE INSERT OR UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION maintain_progress_summary();


-- ── 4. BACKFILL: EXISTING USER_PROGRESS → QUESTION_ATTEMPTS ──
-- Each existing row represents one historically known attempt.
-- Backfill so SRS and adaptive queries have complete history.

INSERT INTO public.question_attempts (
  user_id, question_id, track, topic,
  is_correct, selected_answer, correct_answer,
  response_time_ms, created_at
)
SELECT
  user_id,
  question_id::uuid,
  track,
  topic,
  is_correct,
  selected_answer,
  correct_answer,
  NULL,
  COALESCE(created_at, now())
FROM public.user_progress;


-- ── 5. BACKFILL: SUMMARY COLUMNS ON EXISTING ROWS ────────────
-- The trigger only fires for future writes; patch historic rows
-- manually. total_attempts stays at 1 (only one known attempt).

UPDATE public.user_progress
SET
  consecutive_correct = CASE WHEN is_correct THEN 1 ELSE 0 END,
  last_attempt_at     = COALESCE(created_at, now())
WHERE total_attempts = 1;
