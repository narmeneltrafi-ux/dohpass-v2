-- Adds the missing UPDATE RLS policy on user_progress.
-- Without this, saveProgress()'s upsert fires INSERT on first answer (allowed)
-- but ON CONFLICT DO UPDATE on re-answers, which RLS silently rejects because
-- no UPDATE policy existed. FSRS fields and attempt counters therefore never
-- updated on repeat answers. Additive only — does not touch existing policies.

CREATE POLICY "user_progress: update own"
  ON public.user_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
