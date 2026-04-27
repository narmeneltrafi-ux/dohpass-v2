-- Tighten the profiles UPDATE policy to an explicit allowlist.
--
-- Before: denylist locked is_paid, plan, stripe_customer_id,
-- stripe_subscription_id. New webhook-managed columns added since
-- (stripe_price_id, current_period_end, cancel_at_period_end,
-- grace_period_end) were silently writable by any authenticated user.
--
-- After: every webhook-managed column AND every system-managed column
-- (id, email, created_at) must be unchanged from its current value.
-- Effective allowlist = full_name. Adding new user-editable columns
-- later requires removing them from the locked list below.

DROP POLICY IF EXISTS "profiles: update own" ON public.profiles;

CREATE POLICY "profiles: update own"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  -- Identity / system fields
  AND id = (SELECT id FROM public.profiles WHERE id = auth.uid())
  AND NOT (email           IS DISTINCT FROM (SELECT email           FROM public.profiles WHERE id = auth.uid()))
  AND created_at = (SELECT created_at FROM public.profiles WHERE id = auth.uid())
  -- Subscription state — webhook-managed only
  AND is_paid    = (SELECT is_paid    FROM public.profiles WHERE id = auth.uid())
  AND plan       = (SELECT plan       FROM public.profiles WHERE id = auth.uid())
  AND cancel_at_period_end = (SELECT cancel_at_period_end FROM public.profiles WHERE id = auth.uid())
  AND NOT (stripe_customer_id     IS DISTINCT FROM (SELECT stripe_customer_id     FROM public.profiles WHERE id = auth.uid()))
  AND NOT (stripe_subscription_id IS DISTINCT FROM (SELECT stripe_subscription_id FROM public.profiles WHERE id = auth.uid()))
  AND NOT (stripe_price_id        IS DISTINCT FROM (SELECT stripe_price_id        FROM public.profiles WHERE id = auth.uid()))
  AND NOT (current_period_end     IS DISTINCT FROM (SELECT current_period_end     FROM public.profiles WHERE id = auth.uid()))
  AND NOT (grace_period_end       IS DISTINCT FROM (SELECT grace_period_end       FROM public.profiles WHERE id = auth.uid()))
);
