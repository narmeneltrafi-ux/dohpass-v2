-- P4: Add FSRS v5 scheduling columns to flashcard_progress.
-- Existing rows get sensible defaults so the UI degrades gracefully before
-- any cards are rated with the new 4-button system.

ALTER TABLE public.flashcard_progress
  ADD COLUMN IF NOT EXISTS stability   double precision,
  ADD COLUMN IF NOT EXISTS difficulty  double precision,
  ADD COLUMN IF NOT EXISTS due_date    timestamptz,
  ADD COLUMN IF NOT EXISTS last_review timestamptz,
  ADD COLUMN IF NOT EXISTS reps        int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapses      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fsrs_state  text NOT NULL DEFAULT 'new';

-- Cards already marked known get an initial review state and are due tomorrow.
UPDATE public.flashcard_progress
SET
  reps       = 1,
  fsrs_state = 'review',
  due_date   = now() + interval '1 day',
  marked_at  = COALESCE(marked_at, now())
WHERE is_known = true
  AND reps = 0;

-- All remaining cards (not yet rated) are due immediately.
UPDATE public.flashcard_progress
SET due_date = now()
WHERE due_date IS NULL;

ALTER TABLE public.flashcard_progress
  DROP CONSTRAINT IF EXISTS flashcard_progress_fsrs_state_check;
ALTER TABLE public.flashcard_progress
  ADD CONSTRAINT flashcard_progress_fsrs_state_check
    CHECK (fsrs_state IN ('new', 'learning', 'review', 'relearning'));

CREATE INDEX IF NOT EXISTS idx_flashcard_progress_due
  ON public.flashcard_progress (user_id, due_date)
  WHERE due_date IS NOT NULL;
