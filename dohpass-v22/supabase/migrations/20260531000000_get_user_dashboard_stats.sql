-- ============================================================
-- DOHPass — get_user_dashboard_stats RPC
-- Single-RPC replacement for 5 separate dashboard queries.
-- Uses question_attempts (append-only source of truth) for
-- all counts — never user_progress (cache).
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
    -- Per-track distinct questions (latest attempt determines correct/wrong)
    'specialist_answered', (
      SELECT COUNT(DISTINCT question_id)
      FROM question_attempts
      WHERE user_id = v_user_id AND track = 'specialist'
    ),
    'specialist_correct', (
      SELECT COUNT(DISTINCT question_id)
      FROM (
        SELECT DISTINCT ON (question_id) question_id, is_correct
        FROM question_attempts
        WHERE user_id = v_user_id AND track = 'specialist'
        ORDER BY question_id, created_at DESC
      ) sub
      WHERE is_correct
    ),
    'gp_answered', (
      SELECT COUNT(DISTINCT question_id)
      FROM question_attempts
      WHERE user_id = v_user_id AND track = 'gp'
    ),
    'gp_correct', (
      SELECT COUNT(DISTINCT question_id)
      FROM (
        SELECT DISTINCT ON (question_id) question_id, is_correct
        FROM question_attempts
        WHERE user_id = v_user_id AND track = 'gp'
        ORDER BY question_id, created_at DESC
      ) sub
      WHERE is_correct
    ),
    -- Cross-track total: distinct questions answered across all tracks
    'total_answered', (
      SELECT COUNT(DISTINCT question_id)
      FROM question_attempts
      WHERE user_id = v_user_id
    ),
    -- Activity counts (not deduped — raw attempt volume)
    -- today: UAE midnight boundary (UTC+4) so the counter resets at local midnight
    'today_answered', (
      SELECT COUNT(*)
      FROM question_attempts
      WHERE user_id = v_user_id
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dubai')
                          AT TIME ZONE 'Asia/Dubai'
    ),
    -- weekly: Monday anchor, UAE timezone
    'weekly_answered', (
      SELECT COUNT(*)
      FROM question_attempts
      WHERE user_id = v_user_id
        AND created_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Dubai')
                          AT TIME ZONE 'Asia/Dubai'
    ),
    'flashcard_due', (
      SELECT COUNT(*)
      FROM flashcard_progress
      WHERE user_id = v_user_id AND due_date <= now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_dashboard_stats() TO anon, authenticated, service_role;
