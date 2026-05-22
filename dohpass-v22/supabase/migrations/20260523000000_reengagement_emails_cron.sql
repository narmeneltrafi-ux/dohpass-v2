-- ============================================================
-- DOHPass — Re-engagement email cron
--
-- Fires daily at 06:00 UTC (10:00 UAE). For each of day 2, 5, 10
-- and 14 since email_confirmed_at, finds confirmed users who have
-- never recorded a user_progress row (test accounts excluded) and
-- POSTs {email, day} to the send-reengagement-email edge function
-- via net.http_post.
--
-- Idempotent: drops the cron job if it already exists before
-- re-scheduling.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 1. TRIGGER FUNCTION ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_reengagement_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, net
AS $$
DECLARE
  target_day  integer;
  user_email  text;
BEGIN
  FOREACH target_day IN ARRAY ARRAY[2, 5, 10, 14]
  LOOP
    FOR user_email IN
      SELECT u.email
      FROM   auth.users     u
      JOIN   public.profiles p ON p.id = u.id
      WHERE  u.email_confirmed_at IS NOT NULL
        AND  DATE(u.email_confirmed_at) = CURRENT_DATE - target_day
        AND  u.email IS NOT NULL
        AND  u.email NOT LIKE '%mailinator%'
        AND  u.email NOT LIKE '%test%'
        AND  u.id NOT IN (
                SELECT user_id
                FROM   public.user_progress
                WHERE  user_id IS NOT NULL
             )
    LOOP
      PERFORM net.http_post(
        url     := 'https://qvzvdwvyihwwiqlhgogq.supabase.co/functions/v1/send-reengagement-email',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body    := jsonb_build_object('email', user_email, 'day', target_day)
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Lock down EXECUTE: only the cron owner / service role should call this.
REVOKE ALL ON FUNCTION public.trigger_reengagement_emails() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_reengagement_emails() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.trigger_reengagement_emails() TO service_role;

-- ── 2. CRON SCHEDULE ────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reengagement-emails') THEN
    PERFORM cron.unschedule('reengagement-emails');
  END IF;
END;
$$;

SELECT cron.schedule(
  'reengagement-emails',
  '0 6 * * *',
  $$SELECT public.trigger_reengagement_emails();$$
);
