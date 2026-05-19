CREATE OR REPLACE FUNCTION public.get_trial_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_used int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Only count progress rows from paywall launch (2026-04-27) onward,
  -- so users who answered questions pre-launch aren't trial-exhausted
  -- on day one of the paywall.
  SELECT COUNT(*)::int INTO v_used
  FROM public.user_progress
  WHERE user_id = v_uid
  AND created_at >= '2026-04-27T00:00:00Z';

  RETURN json_build_object(
    'used', v_used,
    'limit', 10,
    'remaining', GREATEST(10 - v_used, 0)
  );
END;
$$;
