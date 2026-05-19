-- Public anonymous-preview RPC. Returns N random active questions for the
-- requested track with no auth check, so unauthenticated visitors can sample
-- the bank before signing up. The 3-question cap is enforced client-side via
-- localStorage; the server caps p_limit at 5 to bound abuse if the client
-- gate is bypassed.
CREATE OR REPLACE FUNCTION public.get_preview_questions(
  p_track text,
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  topic text,
  subtopic text,
  q text,
  options text[],
  answer text,
  explanation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 3), 0), 5);
BEGIN
  IF v_limit = 0 THEN
    RETURN;
  END IF;

  IF LOWER(p_track) = 'specialist' THEN
    RETURN QUERY
      SELECT s.id, s.topic, s.subtopic, s.q, s.options, s.answer, s.explanation
      FROM public.specialist_questions s
      WHERE s.is_active = true
      ORDER BY random()
      LIMIT v_limit;
  ELSIF LOWER(p_track) = 'gp' THEN
    RETURN QUERY
      SELECT g.id, g.topic, g.subtopic, g.q, g.options, g.answer, g.explanation
      FROM public.gp_questions g
      WHERE g.is_active = true
      ORDER BY random()
      LIMIT v_limit;
  ELSE
    RAISE EXCEPTION 'invalid track: %', p_track;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preview_questions(text, integer) TO anon, authenticated;
