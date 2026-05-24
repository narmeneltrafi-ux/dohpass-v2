-- ============================================================
-- DOHPass — Manual bank-transfer operations
-- Run these by hand in the Supabase SQL editor (service role).
-- Access model: ONE payment = 30 days. Access is DATED via
-- profiles.access_expires_at and RE-LOCKS automatically on expiry.
-- is_paid is intentionally left FALSE for manual grants (setting it
-- true would make access indefinite — the bug we are avoiding).
-- ============================================================


-- ───────────────────────────────────────────────────────────
-- 1) GRANT / RENEW ACCESS  (run after confirming a transfer)
--    Matches the pending order by the reference from the bank memo,
--    grants the buyer 30 days, and marks the order paid.
--    Early renewals STACK (extends from the later of now or current expiry).
-- ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ref  text := 'DOH-XXXX-XXXX';     -- << payment reference from the transfer memo
  v_plan text := 'specialist';        -- << 'gp' | 'specialist' | 'all_access'
  v_uid  uuid;
  v_new_expiry timestamptz;
BEGIN
  SELECT user_id INTO v_uid
  FROM public.manual_orders
  WHERE payment_reference = v_ref AND status = 'pending';

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No PENDING order found for reference %', v_ref;
  END IF;

  -- Extend from whichever is later: existing (unexpired) access or now.
  UPDATE public.profiles
  SET plan = v_plan,
      access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now())
                          + interval '30 days',
      is_paid = false                  -- DATED access only — never indefinite
  WHERE id = v_uid
  RETURNING access_expires_at INTO v_new_expiry;

  UPDATE public.manual_orders
  SET status = 'paid',
      granted_at = now(),
      expires_at = v_new_expiry
  WHERE payment_reference = v_ref;

  RAISE NOTICE 'Granted % to % — access now expires %', v_plan, v_uid, v_new_expiry;
END $$;


-- ───────────────────────────────────────────────────────────
-- 2) WORK QUEUE  (run anytime to see what needs action)
--    Pending orders to verify + anyone expiring within 3 days (renewals).
-- ───────────────────────────────────────────────────────────
SELECT
  'PENDING ORDER'        AS action,
  mo.payment_reference   AS reference,
  mo.user_email          AS email,
  mo.amount_aed          AS amount_aed,
  mo.created_at          AS when_ts
FROM public.manual_orders mo
WHERE mo.status = 'pending'

UNION ALL

SELECT
  'EXPIRING < 3 DAYS'    AS action,
  NULL                   AS reference,
  p.email                AS email,
  NULL                   AS amount_aed,
  p.access_expires_at    AS when_ts
FROM public.profiles p
WHERE p.access_expires_at IS NOT NULL
  AND p.access_expires_at BETWEEN now() AND now() + interval '3 days'

ORDER BY action, when_ts;


-- ───────────────────────────────────────────────────────────
-- 3) OPTIONAL — reset a lapsed user's plan label back to 'free'.
--    The paywall already re-locks on expiry (access_expires_at is in the
--    past), but plan stays at its purchased value, so the nav badge still
--    reads e.g. "Specialist". Run this to also reset the label.
-- ───────────────────────────────────────────────────────────
-- UPDATE public.profiles
-- SET plan = 'free'
-- WHERE access_expires_at IS NOT NULL
--   AND access_expires_at < now()
--   AND is_paid = false;
