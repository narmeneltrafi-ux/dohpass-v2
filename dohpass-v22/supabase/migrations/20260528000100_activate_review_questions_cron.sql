-- ============================================================
-- DOHPass — Activate review-questions cron job
--
-- Schedules the review-questions edge function to run daily at
-- 04:00 UTC (08:00 UAE). The function has its own once-per-UTC-day
-- rate-limit guard so overlapping invocations are safe.
--
-- The function reviews AI-generated questions that have not yet
-- been validated (needs_review IS NULL), corrects wording/grammar,
-- and flags potential answer errors for manual inspection.
--
-- Pattern mirrors send-reengagement-email: reads CRON_SECRET from
-- vault.decrypted_secrets so the secret is never baked into SQL.
--
-- Idempotent: unschedules any existing job with the same name
-- before re-scheduling.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 1. TRIGGER FUNCTION ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_review_questions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  cron_secret text;
BEGIN
  SELECT decrypted_secret
    INTO cron_secret
    FROM vault.decrypted_secrets
   WHERE name = 'CRON_SECRET'
   LIMIT 1;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE EXCEPTION 'trigger_review_questions: CRON_SECRET missing from vault.decrypted_secrets';
  END IF;

  PERFORM net.http_post(
    url     := 'https://qvzvdwvyihwwiqlhgogq.supabase.co/functions/v1/review-questions',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', cron_secret
               ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Lock down EXECUTE: only service_role should invoke this.
REVOKE ALL ON FUNCTION public.trigger_review_questions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_review_questions() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.trigger_review_questions() TO service_role;

-- ── 2. CRON SCHEDULE ────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'review-questions') THEN
    PERFORM cron.unschedule('review-questions');
  END IF;
END;
$$;

SELECT cron.schedule(
  'review-questions',
  '0 4 * * *',
  $$SELECT public.trigger_review_questions();$$
);
