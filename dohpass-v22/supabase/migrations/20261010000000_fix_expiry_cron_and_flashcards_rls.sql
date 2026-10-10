-- Fix two access-expiry gaps found 2026-10-10.
--
-- 1. expire_lapsed_access() (cron job 16, nightly) only checked
--    current_period_end, a Stripe-era column that no profile uses since the
--    move to manual grants. It has downgraded 0 rows since May, leaving
--    expired accounts with is_paid = true. Manual grants set access_expires_at,
--    so the job now checks both columns.
--
-- 2. The flashcards SELECT policy checked only is_paid + plan, with no expiry
--    check. 20260629 enforce_access_expiry_in_question_rls fixed the question
--    tables but missed flashcards, so expired-but-is_paid users could still
--    read paid flashcards. The policy now mirrors the question-table policies
--    and hasAccess() in src/lib/supabase.js:
--      grace period active -> allow
--      access_expires_at set -> allow only if in the future
--      no expiry -> legacy lifetime access via is_paid

-- 1. Nightly expiry job -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_lapsed_access()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  affected integer;
BEGIN
  UPDATE public.profiles
  SET is_paid = false,
      cancel_at_period_end = false
  WHERE is_paid = true
    AND (
      (access_expires_at IS NOT NULL AND access_expires_at < now())
      OR (current_period_end IS NOT NULL AND current_period_end < now())
    )
    AND (grace_period_end IS NULL OR grace_period_end < now());
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE LOG 'expire_lapsed_access: downgraded % profile(s)', affected;
  RETURN affected;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_lapsed_access() FROM PUBLIC, anon, authenticated;

-- 2. Flashcards paid-read policy ---------------------------------------------
DROP POLICY IF EXISTS "Paid users read flashcards" ON public.flashcards;

CREATE POLICY "Paid users read flashcards"
ON public.flashcards
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.plan = 'all_access' OR lower(p.plan) = lower(flashcards.track))
      AND (
        (p.grace_period_end IS NOT NULL AND p.grace_period_end > now())
        OR (p.access_expires_at IS NOT NULL AND p.access_expires_at > now())
        OR (p.access_expires_at IS NULL AND p.is_paid = true)
      )
  )
);
