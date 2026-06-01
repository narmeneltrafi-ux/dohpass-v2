-- ============================================================
-- DOHPass — get_user_dashboard_stats RPC
-- Single-RPC replacement for 5 separate dashboard queries.
-- Uses question_attempts (append-only source of truth) for
-- all counts — never user_progress (cache) — so deduplication
-- and accuracy are always correct regardless of cache staleness.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    -- Distinct questions attempted per track (question_attempts = source of truth)
    'specialist_answered', (
      SELECT COUNT(DISTINCT question_id)
      FROM question_attempts
      WHERE user_id = v_user_id AND track = 'specialist'
    ),
    'specialist_correct',  (
      SELECT COUNT(DISTINCT question_id)
      FROM (
        SELECT DISTINCT ON (question_id) question_id, is_correct
        FROM question_attempts
        WHERE user_id = v_user_id AND track = 'specialist'
        ORDER BY question_id, created_at DESC
      ) sub
      WHERE is_correct
    ),
    'gp_answered',         (
      SELECT COUNT(DISTINCT question_id)
      FROM question_attempts
      WHERE user_id = v_user_id AND track = 'gp'
    ),
    'gp_correct',          (
      SELECT COUNT(DISTINCT question_id)
      FROM (
        SELECT DISTINCT ON (question_id) question_id, is_correct
        FROM question_attempts
        WHERE user_id = v_user_id AND track = 'gp'
        ORDER BY question_id, created_at DESC
      ) sub
      WHERE is_correct
    ),
    -- Activity counts: every attempt (not deduped — matches user expectation)
    -- today: truncated to UAE midnight (UTC+4) so the count resets at the
    -- correct local day boundary, not UTC midnight (which would be 8 PM local)
    'today_answered', (
      SELECT COUNT(*)
      FROM question_attempts
      WHERE user_id = v_user_id
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dubai')
                          AT TIME ZONE 'Asia/Dubai'
    ),
    -- weekly: rolling 7-day window — no calendar boundary, no timezone issue
    'weekly_answered', (
      SELECT COUNT(*)
      FROM question_attempts
      WHERE user_id = v_user_id
        AND created_at >= now() - interval '7 days'
    ),
    'flashcard_due', (
      SELECT COUNT(*)
      FROM flashcard_progress
      WHERE user_id = v_user_id AND due_date <= now()
    )
  );
END;
$$;

-- Grant execute to all Supabase roles that need it
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_stats() TO anon, authenticated, service_role;
