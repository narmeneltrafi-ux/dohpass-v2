-- Security fix: cap the trial-question RPC at the real trial limit (10) and
-- count only post-launch progress.
--
-- The previous version had TRIAL_TOTAL = 30 and counted user_progress rows
-- with no date filter, so a fresh post-launch user received up to 30 questions
-- in a single round-trip even though the UI gate only allowed 10 attempts.
-- The extra 20 questions plus their answers and explanations leaked over the
-- wire to free users.
--
-- Constants are now aligned with get_trial_status: TRIAL_TOTAL = 10,
-- LAUNCH_DATE = 2026-04-27.
CREATE OR REPLACE FUNCTION public.get_trial_questions(p_track text, p_limit int DEFAULT 10)
RETURNS TABLE(id uuid, topic text, subtopic text, q text, options text[], answer text, explanation text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_used int;
  v_remaining int;
  TRIAL_TOTAL CONSTANT int := 10;
  LAUNCH_DATE CONSTANT timestamptz := '2026-04-27T00:00:00Z';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT COUNT(*)::int INTO v_used
  FROM public.user_progress
  WHERE user_id = v_uid
  AND created_at >= LAUNCH_DATE;

  v_remaining := GREATEST(TRIAL_TOTAL - v_used, 0);
  IF v_remaining > p_limit THEN
    v_remaining := p_limit;
  END IF;

  IF v_remaining = 0 THEN
    RETURN;
  END IF;

  IF LOWER(p_track) = 'specialist' THEN
    RETURN QUERY
      SELECT s.id, s.topic, s.subtopic, s.q, s.options, s.answer, s.explanation
      FROM public.specialist_questions s
      WHERE s.is_active = true
      ORDER BY random()
      LIMIT v_remaining;
  ELSIF LOWER(p_track) = 'gp' THEN
    RETURN QUERY
      SELECT g.id, g.topic, g.subtopic, g.q, g.options, g.answer, g.explanation
      FROM public.gp_questions g
      WHERE g.is_active = true
      ORDER BY random()
      LIMIT v_remaining;
  ELSE
    RAISE EXCEPTION 'invalid track: %', p_track;
  END IF;
END;
$$;
