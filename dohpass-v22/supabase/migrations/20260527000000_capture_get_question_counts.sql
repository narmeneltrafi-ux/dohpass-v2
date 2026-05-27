-- Capture get_question_counts into migration history.
-- This function already exists in production; this migration records it so the
-- schema is fully tracked. Behavior is unchanged.
CREATE OR REPLACE FUNCTION public.get_question_counts()
  RETURNS json
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT json_build_object(
    'specialist', (SELECT COUNT(*) FROM public.specialist_questions WHERE is_active = true),
    'gp',         (SELECT COUNT(*) FROM public.gp_questions WHERE is_active = true),
    'flashcards', (SELECT COUNT(*) FROM public.flashcards WHERE is_active = true)
  );
$$;
