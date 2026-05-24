-- ============================================================
-- DOHPass — Manual bank-transfer payment rail
-- Adds: profiles.access_expires_at (dated access)
--       manual_orders table + RLS
-- Idempotent; safe to re-run.
-- NO client-writable path to access. Grants are service-role only.
-- ============================================================

-- ── 1. DATED-ACCESS COLUMN ON PROFILES ──────────────────────
-- hasAccess() grants while this is in the future and re-locks
-- automatically once it passes. Manual grants set this column and
-- leave is_paid = false (is_paid would grant access indefinitely).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.access_expires_at IS
  'Manual bank-transfer rail: dated access expiry. hasAccess() grants while this is in the future and re-locks automatically once it passes. Service-role/admin write only.';

-- NOTE: the existing "profiles: update own" RLS policy is intentionally
-- left untouched. The column-level GRANT below (authenticated may UPDATE
-- only full_name, set in 20260419_stripe_subscription_metadata.sql) already
-- makes access_expires_at unwritable by any authenticated client. No
-- authenticated grant names access_expires_at.

-- ── 2. MANUAL_ORDERS TABLE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email        text        NOT NULL,
  amount_aed        integer     NOT NULL,
  payment_reference text        NOT NULL UNIQUE,
  status            text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','cancelled','expired')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  granted_at        timestamptz,
  expires_at        timestamptz
);

COMMENT ON TABLE public.manual_orders IS
  'Manual bank-transfer orders. Users INSERT pending rows only; status/grant is service-role/admin only.';

CREATE INDEX IF NOT EXISTS manual_orders_user_id_idx ON public.manual_orders (user_id);
CREATE INDEX IF NOT EXISTS manual_orders_status_idx  ON public.manual_orders (status);

-- ── 3. ROW LEVEL SECURITY — MANUAL_ORDERS ───────────────────
ALTER TABLE public.manual_orders ENABLE ROW LEVEL SECURITY;

-- Users may read ONLY their own orders
DROP POLICY IF EXISTS "manual_orders: select own" ON public.manual_orders;
CREATE POLICY "manual_orders: select own"
  ON public.manual_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Users may INSERT ONLY their own row, status forced to 'pending'
DROP POLICY IF EXISTS "manual_orders: insert own pending" ON public.manual_orders;
CREATE POLICY "manual_orders: insert own pending"
  ON public.manual_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- NO update / delete policy for users → denied by default under RLS.
-- Only service_role (admin grant) can flip status / set grant dates.

-- ── 4. GRANTS ───────────────────────────────────────────────
-- Column-scoped INSERT: users cannot even name status/granted_at/expires_at,
-- so the 'pending' default always holds and grant dates stay admin-only.
GRANT SELECT ON public.manual_orders TO authenticated;
GRANT INSERT (user_id, user_email, amount_aed, payment_reference)
  ON public.manual_orders TO authenticated;
GRANT ALL ON public.manual_orders TO service_role;
