-- ============================================================
-- DOHPass — Stripe subscription metadata
-- Adds Stripe lifecycle columns to profiles + tightens write grants
-- so only service_role (webhook) can mutate billing state.
-- Safe to run on a live database (idempotent).
-- ============================================================


-- ── 1. ADD STRIPE COLUMNS TO PROFILES ───────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text,
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean NOT NULL DEFAULT false;


-- ── 2. INDEX ON stripe_customer_id ──────────────────────────
-- Webhook events like customer.subscription.updated carry the Stripe
-- customer id but not our user id, so we need to look up the profile
-- by stripe_customer_id. Partial index skips the NULL majority.

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- ── 3. LOCK DOWN WRITE ACCESS ───────────────────────────────
-- Users can SELECT their own row (existing "profiles: select own"
-- policy still applies unchanged).
--
-- Users must NOT be able to UPDATE plan / is_paid / any stripe_*
-- column — only the webhook (service_role) writes them. The existing
-- RLS UPDATE policy is row-scoped but not column-scoped, and the
-- existing GRANT gives `authenticated` UPDATE on every column.
--
-- Fix: revoke the broad UPDATE grant and re-grant UPDATE only on
-- the columns users legitimately edit (full_name). Service role
-- bypasses both RLS and column grants, so the webhook is unaffected.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (full_name) ON public.profiles TO authenticated;


-- ── 4. COMMENTS FOR AUDITABILITY ────────────────────────────

COMMENT ON COLUMN public.profiles.stripe_customer_id     IS 'Stripe customer id — set by stripe-webhook on first checkout.';
COMMENT ON COLUMN public.profiles.stripe_subscription_id IS 'Active Stripe subscription id — cleared on customer.subscription.deleted.';
COMMENT ON COLUMN public.profiles.stripe_price_id        IS 'Current Stripe price id — reflects active tier.';
COMMENT ON COLUMN public.profiles.current_period_end     IS 'End of current billing period (unix -> timestamptz).';
COMMENT ON COLUMN public.profiles.cancel_at_period_end   IS 'True if user has scheduled cancellation; sub stays active until current_period_end.';
