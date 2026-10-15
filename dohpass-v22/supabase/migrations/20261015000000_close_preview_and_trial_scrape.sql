-- Close two question-bank scraping paths found 2026-10-15.
--
-- 1. get_preview_questions (anon + authenticated) returned 5 RANDOM questions
--    with answers and explanations per call, with no server-side limit.
--    Repeated calls could download the whole bank without logging in
--    (verified: 100 questions in seconds). The 5-question anon limit only
--    lived in the browser.
--    Fix: return a FIXED set — the same 5 questions per track for every
--    visitor. The preview experience is unchanged; there is nothing more to
--    harvest.
--
-- 2. get_trial_questions (authenticated, free users) counted the 10-question
--    trial by ANSWERED questions and returned a random unanswered set. A free
--    account that never answers got 10 new questions per call.
--    Fix: order by a per-user deterministic hash, so each user always gets the
--    same 10 candidates. Paid users are unaffected (they keep random order;
--    they already have full access through RLS).
--
-- Neither function's signature, return shape or grants change, so no client
-- code needs to change.

-- 1. Anonymous / landing preview ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_preview_questions(p_track text, p_limit integer DEFAULT 3)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 3), 0), 5);
BEGIN
  IF p_track = 'gp' THEN
    RETURN QUERY
      SELECT to_json(t) FROM (
        SELECT id, q, options, answer, explanation, topic, broad_topic
        FROM public.gp_questions
        WHERE is_active = true
        ORDER BY md5(id::text || 'dohpass-preview-v1')
        LIMIT v_limit
      ) t;
  ELSE
    RETURN QUERY
      SELECT to_json(t) FROM (
        SELECT id, q, options, answer, explanation, topic
        FROM public.specialist_questions
        WHERE is_active = true
        ORDER BY md5(id::text || 'dohpass-preview-v1')
        LIMIT v_limit
      ) t;
  END IF;
END;
$function$;

-- 2. Logged-in free trial ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_questions(p_track text, p_limit integer DEFAULT 10)
RETURNS TABLE(id uuid, topic text, subtopic text, q text, options text[], answer text, explanation text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_used int;
  v_remaining int;
  v_paid boolean;
  TRIAL_TOTAL constant int := 10;
  LAUNCH_DATE constant timestamptz := '2026-04-27T00:00:00Z';
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;

  v_paid := public.user_has_access(v_uid);

  if v_paid then
    v_remaining := greatest(coalesce(p_limit, 10), 0);
  else
    select count(distinct qa.question_id)::int into v_used
    from public.question_attempts qa
    where qa.user_id = v_uid
      and qa.created_at >= LAUNCH_DATE;

    v_remaining := greatest(TRIAL_TOTAL - v_used, 0);
    if v_remaining > coalesce(p_limit, 10) then
      v_remaining := coalesce(p_limit, 10);
    end if;
  end if;

  if v_remaining = 0 then
    return;
  end if;

  if lower(p_track) = 'specialist' then
    return query
      select s.id, s.topic, s.subtopic, s.q, s.options, s.answer, s.explanation
      from public.specialist_questions s
      where s.is_active = true
        and not exists (
          select 1 from public.question_attempts qa
          where qa.user_id = v_uid and qa.question_id = s.id
        )
      order by case when v_paid then random()::text
                    else md5(s.id::text || v_uid::text) end
      limit v_remaining;
  elsif lower(p_track) = 'gp' then
    return query
      select g.id, g.topic, g.subtopic, g.q, g.options, g.answer, g.explanation
      from public.gp_questions g
      where g.is_active = true
        and not exists (
          select 1 from public.question_attempts qa
          where qa.user_id = v_uid and qa.question_id = g.id
        )
      order by case when v_paid then random()::text
                    else md5(g.id::text || v_uid::text) end
      limit v_remaining;
  else
    raise exception 'invalid track: %', p_track;
  end if;
end;
$function$;
