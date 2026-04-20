# Stripe Go-Live Runbook

Cutting DOHPass from Stripe **test mode** → **live mode** (real charges).
Follow every step in order. Do not skip pre-flight.

**Estimated hands-on time:** 30–45 minutes
**Expected downtime window:** ~2 minutes (between Vercel env update and redeploy)
**Rollback window:** first 60 minutes after go-live — aggressive monitoring
**Do this during low traffic.**

---

## 1. Pre-flight checklist

All of these must be ✅ before you start Section 2. If anything is ❌,
fix it first or abort.

### 1.1 — Webhook handler coverage (test mode)

- [ ] **`checkout.session.completed`** — verified end-to-end (Stage 2 of paywall smoke test: checkout succeeds, profile flips `is_paid=true` + `plan` + `stripe_customer_id`)
- [ ] **`customer.subscription.updated`** — verified for `active`, `cancel_at_period_end=true`, and `canceled` status transitions
- [ ] **`customer.subscription.deleted`** — verified clears sub-scoped fields and preserves `stripe_customer_id`
- [ ] **`invoice.payment_succeeded`** — observed during checkout smoke tests (audit log only, no state change)
- [ ] **`invoice.payment_failed`** — handler code-reviewed but **not** runtime-tested. Acceptable risk for v1 (log-only, no state change). Low priority to force-test before go-live; will surface naturally on the first dunning failure.

### 1.2 — Test subscription lifecycle

- [ ] A test subscription has been **created, cancelled, and reactivated** on a throwaway user
- [ ] `is_paid` flipped `false` → `true` → `true (cancel-scheduled)` → `false` → `true` through the full flow
- [ ] `stripe_customer_id` was **preserved** on deletion and **reused** on reactivation (PR #7 customer-reuse behavior)

### 1.3 — Customer Portal (test mode)

- [ ] Portal URL redirects from `/account` → `billing.stripe.com/p/session/...`
- [ ] Portal shows: **Cancel**, **Payment methods**, **Invoice history**
- [ ] Portal does **NOT** show: plan switching, quantity changes
- [ ] "Return to DOHPass" link lands on `/account`
- [ ] Portal config in dashboard has: return URL = `https://dohpass.com/account`, business email = `support@dohpass.com`

### 1.4 — Operational readiness

- [ ] **`support@dohpass.com`** mailbox exists and forwards to a human who monitors it
- [ ] Stripe live-mode activation is complete (business verification, bank account, tax/VAT forms submitted and approved — check Stripe Dashboard → Settings → Business → Activate account)
- [ ] Stripe account is not in any "restricted" or "under review" state (banner at top of dashboard would indicate)
- [ ] Terms of Service + Privacy Policy URLs in Stripe Customer Portal match what's actually published on the site
- [ ] You have the Vercel dashboard, Supabase dashboard, and Stripe dashboard open in three tabs for Section 2

### 1.5 — Known platform issue (not blocking, but document aware)

- [ ] Supabase Edge Functions gateway rejects both ES256 (`UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`) and HS256 (`UNAUTHORIZED_LEGACY_JWT`) JWTs on this project. `create-checkout` and `create-portal-session` work around this with `verify_jwt=false` in `supabase/config.toml` and in-function GoTrue verification. **Going live does not fix or worsen this** — documented in a separate Supabase support ticket. Do not regress the workaround.

---

## 2. Cutover

Execute in order. Each step has a **Verify** sub-step that confirms before moving on.
If a verify fails, stop and investigate — do not continue.

### 2.1 — Create live-mode products + prices

In Stripe Dashboard, toggle to **Live mode** (top-right switch turns from orange "Test mode" to blue "Live mode").

1. **Products** → **Add product** — create three products matching the test-mode ones:
    - GP Plan (49 AED/month, recurring)
    - Specialist (69 AED/month, recurring)
    - All Access (89 AED/month, recurring)
2. For each product, note the **Price ID** that Stripe generates (`price_1XXXXX...`, prefixed `price_` but a NEW id, not the test mode one).
3. Record them in a scratch note — you'll paste them into code at Step 2.5.

**Expected live price IDs** (fill in):
```
GP Plan:      price_______________________
Specialist:   price_______________________
All Access:   price_______________________
```

**Verify:** each product shows "Active" and the price ID starts with `price_` (no `price_test_` prefix in live mode).

### 2.2 — Create live-mode webhook endpoint

Still in Live mode:

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL: `https://qvzvdwvyihwwiqlhgogq.supabase.co/functions/v1/stripe-webhook`
3. **Events to send** — add exactly these five (search-and-select):
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
    - `invoice.payment_succeeded`
4. API version: leave as Stripe's default
5. Click **Add endpoint**
6. Click into the new endpoint → **Reveal signing secret** → copy the `whsec_...` value. This is the **live webhook secret**.

**Verify:** endpoint status is "Enabled" and listing shows exactly 5 events.

### 2.3 — Update Supabase function secrets

These env vars are read at runtime by `stripe-webhook`, `create-checkout`, and `create-portal-session`.

From a local terminal in `dohpass-v22/`:

```bash
npx supabase secrets set STRIPE_SECRET_KEY="sk_live_..." --project-ref qvzvdwvyihwwiqlhgogq
npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..." --project-ref qvzvdwvyihwwiqlhgogq
```

- `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys → "Secret key" in live mode (`sk_live_...`). **Not publishable**, not restricted.
- `STRIPE_WEBHOOK_SECRET`: the `whsec_...` from Step 2.2.

**Do NOT touch:** `SB_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `ANTHROPIC_API_KEY`.

**Verify:**
```bash
npx supabase secrets list --project-ref qvzvdwvyihwwiqlhgogq
```
The digests of `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must be different from what they were before (they were holding test-mode values). `SB_SERVICE_ROLE_KEY` digest should be unchanged.

### 2.4 — Update Vercel frontend env var

Currently the only Stripe-related frontend env is `VITE_STRIPE_PUBLISHABLE_KEY` (if used) and `VITE_SUPABASE_PUBLISHABLE_KEY` is the Supabase API key (unrelated — leave alone).

> **Note:** As of the current repo, the frontend only calls `supabase.functions.invoke('create-checkout')` — it does NOT use `@stripe/stripe-js` directly, so `VITE_STRIPE_PUBLISHABLE_KEY` may not actually be consumed. Check `src/lib/supabase.js` and `src/pages/Pricing.jsx` before changing Vercel env. If the var isn't referenced anywhere, skip this step.

If `VITE_STRIPE_PUBLISHABLE_KEY` is in use:

1. Vercel Dashboard → `dohpass-v2-pthr` → **Settings** → **Environment Variables**
2. Edit `VITE_STRIPE_PUBLISHABLE_KEY` for **Production** environment
3. New value: `pk_live_...` from Stripe Dashboard → Developers → API keys (live mode) → Publishable key
4. **Save**. Do NOT trigger a redeploy yet — we're going to redeploy as part of Step 2.5 after updating price IDs.

### 2.5 — Update hardcoded price IDs in code, deploy

Two files have the test-mode price IDs:

1. **`dohpass-v22/src/pages/Pricing.jsx`** — the `PLANS` array near the top
2. **`dohpass-v22/supabase/functions/stripe-webhook/index.ts`** — the `PRICE_TO_PLAN` lookup map near the top

Replace **all three test-mode price IDs** in **both files** with the live IDs from Step 2.1. Example:

```diff
 const PLANS = [
-  { priceId: 'price_1TMjzp9oYokhs2iDMYKAdc6c', id: 'gp', price: '49 AED/month' },
-  { priceId: 'price_1TMk0W9oYokhs2iDmzZxIyTh', id: 'specialist', price: '69 AED/month' },
-  { priceId: 'price_1TMk1L9oYokhs2iDnwA0yLuX', id: 'all_access', price: '89 AED/month' },
+  { priceId: 'price_1LIVE_GP_ID',          id: 'gp', price: '49 AED/month' },
+  { priceId: 'price_1LIVE_SPECIALIST_ID',  id: 'specialist', price: '69 AED/month' },
+  { priceId: 'price_1LIVE_ALL_ACCESS_ID',  id: 'all_access', price: '89 AED/month' },
 ]
```

```diff
 const PRICE_TO_PLAN: Record<string, string> = {
-  "price_1TMjzp9oYokhs2iDMYKAdc6c": "gp",
-  "price_1TMk0W9oYokhs2iDmzZxIyTh": "specialist",
-  "price_1TMk1L9oYokhs2iDnwA0yLuX": "all_access",
+  "price_1LIVE_GP_ID":          "gp",
+  "price_1LIVE_SPECIALIST_ID":  "specialist",
+  "price_1LIVE_ALL_ACCESS_ID":  "all_access",
 };
```

Commit as one PR, e.g. `chore(stripe): switch price IDs to live mode`. Merge after CI passes.

**Deploy frontend:** Vercel auto-deploys on merge to `main`. Wait for the deployment to go green before proceeding.

**Deploy webhook:**
```bash
cd dohpass-v22 && git pull origin main
npx supabase functions deploy stripe-webhook --no-verify-jwt --project-ref qvzvdwvyihwwiqlhgogq
```

**Verify (both):**
- Fetch https://www.dohpass.com/assets/index-*.js and grep for `price_1LIVE_GP_ID` (or whatever the live ids are). Should appear. `price_1TMjzp9o*` (test id) should NOT appear.
- Via MCP or supabase CLI, confirm `stripe-webhook`'s `ezbr_sha256` changed from the previous value and the deployed source contains the new price ids.

### 2.6 — Live-mode smoke test (real money)

**This is the no-going-back step.** Uses a real card for a real charge; refund immediately after verification.

Prerequisites:
- A fresh throwaway email (e.g. `golive-smoke@dohpass.com`) to avoid touching any real users
- A personal credit card (not the company card, to keep accounting clean)

1. Sign up at dohpass.com as `golive-smoke@dohpass.com`
2. Confirm email
3. Navigate to `/pricing` → Subscribe to the cheapest plan (GP, 49 AED)
4. Complete Stripe Checkout with your **real** card
5. Wait for `/payment-success` to flip to "Welcome!"

**Verify within 30 seconds:**
- Profile row via Supabase SQL:
  ```sql
  SELECT plan, is_paid, stripe_customer_id, stripe_subscription_id,
         stripe_price_id, current_period_end, cancel_at_period_end
  FROM public.profiles
  WHERE email = 'golive-smoke@dohpass.com';
  ```
  Expected: `plan='gp'`, `is_paid=true`, `stripe_customer_id` starts with `cus_` (live mode), `stripe_subscription_id` starts with `sub_`, `current_period_end` ~30 days out.
- `stripe-webhook` logs show 3 POST 200s within ~5s of the checkout complete:
  `checkout.session.completed`, `customer.subscription.updated`, `invoice.payment_succeeded`.
- No 500s anywhere in the last 5 minutes.

**Refund the test charge:**
1. Stripe Dashboard (Live mode) → **Customers** → find `golive-smoke@dohpass.com`
2. Click the payment → **Refund payment** → full amount, reason: "duplicate/testing"
3. Also cancel the subscription: Customers → subscription → **Cancel immediately**

**Verify post-refund:**
- `customer.subscription.deleted` webhook fires → profile row: `is_paid=false`, `plan='free'`, `stripe_subscription_id=NULL`, `stripe_customer_id` preserved (for audit).
- Refund appears in Stripe dashboard as "Refunded" status.

### 2.7 — Monitor for 60 minutes

Live mode is now the real system. For the first hour after go-live:

- [ ] Watch `stripe-webhook` logs every ~10 minutes for any 500/4xx
- [ ] Watch `create-checkout` logs for any unusual 4xx (especially `resource_missing` — could indicate a test-mode `cus_` still sitting in a profile)
- [ ] Watch Stripe Dashboard → **Events** for any `Failed` deliveries
- [ ] If a real customer purchases, spot-check their profile row to ensure fields populate correctly

If anything looks wrong, jump to Section 3 (Rollback).

---

## 3. Rollback plan

### 3.1 — When to rollback vs fix forward

**Rollback (revert to test mode) if, within the first hour:**
- `stripe-webhook` is returning 500 on every live event (handler broken in some way that wasn't caught in smoke test)
- `create-checkout` is 100% failing (users can't subscribe at all)
- Stripe dashboard shows the account has been restricted / suspended unexpectedly
- Any data-integrity red flag: wrong plan, wrong user attributed to a charge, etc.

**Fix forward (don't rollback) for:**
- One specific edge case that affects a small percentage of users (patch + redeploy)
- Cosmetic / UI issues
- Issues with plan-switching (we didn't enable it anyway)
- `invoice.payment_failed` handler behavior (log-only, no user impact)

### 3.2 — Full rollback to test mode

**This leaves any live-mode customers who paid in limbo** — their payment succeeded at Stripe, but our DB won't reflect it until we fix-forward, and their subscription will continue billing unless we refund. **Only do this if you'd rather have the site working in test mode than have live payments broken.**

**Order of operations** (reverse of cutover):

1. **Revert code changes** — create a revert PR of the Step 2.5 commit, merge, auto-deploy.
    ```bash
    git revert <commit-sha>  # the "switch price IDs to live mode" commit
    git push
    ```
    This puts test-mode price ids back in `Pricing.jsx` and `stripe-webhook`. Vercel auto-deploys. Redeploy the webhook:
    ```bash
    npx supabase functions deploy stripe-webhook --no-verify-jwt --project-ref qvzvdwvyihwwiqlhgogq
    ```

2. **Revert Supabase secrets** to the test-mode values (you did save these somewhere, right?).
    ```bash
    npx supabase secrets set STRIPE_SECRET_KEY="sk_test_..." --project-ref qvzvdwvyihwwiqlhgogq
    npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_test_..." --project-ref qvzvdwvyihwwiqlhgogq
    ```
    If you don't have the old test values, pull them from Stripe Dashboard (Test mode) → Developers → API keys, and from the test-mode webhook endpoint's signing secret.

3. **Revert Vercel** `VITE_STRIPE_PUBLISHABLE_KEY` to the test-mode value (`pk_test_...`) if you changed it. Redeploy.

4. **Disable the live webhook endpoint** in Stripe → Developers → Webhooks → toggle to disabled. Prevents noisy retry storms on a stale endpoint.

5. **Refund any live charges** that happened during the broken window. Stripe Dashboard → Payments → select each → Refund. Follow up with email to affected customers via `support@dohpass.com`.

6. **Cancel any live subscriptions** that were created. Stripe Dashboard → Customers → each → Cancel subscription immediately.

7. **Post-mortem** — keep the live webhook disabled and the live-mode products in place for your next go-live attempt. Don't delete them; you'll reuse the same products + prices when fixing forward.

### 3.3 — Emergency stop (nuclear option)

If a bug is actively harming users (e.g. charges going through but access not granted, data leaking, etc.) and you can't do a full rollback fast enough:

1. Disable the **Subscribe** buttons by pushing a quick PR that throws early in `createCheckoutSession`:
    ```js
    export async function createCheckoutSession() {
      return { url: null, error: 'Subscriptions are temporarily unavailable. Please try again later.' }
    }
    ```
    Stops new charges immediately on Vercel deploy. Doesn't affect existing customers.

2. In Stripe Dashboard → Settings → Billing → disable new subscription creation at the account level. Existing subs continue billing.

3. Then do a full rollback per 3.2 at your own pace.

---

## 4. Known gotchas (carried from test mode)

These are pre-existing issues that do NOT block go-live but you should know they exist:

- **`paywall-smoke@dohpass.com`** is a test-mode customer with a test-mode `stripe_customer_id` on their profile. After go-live, this user's Customer Portal will fail (`create-checkout` catches the "customer missing in this mode" error; `create-portal-session` does NOT — it would 404 or error). Recommended: delete the user before cutover, or leave them and accept the broken state for test artifacts.
    ```sql
    -- Optional cleanup before go-live:
    DELETE FROM auth.users WHERE email = 'paywall-smoke@dohpass.com';
    -- CASCADE handles profile + user_progress rows
    ```

- **`e2e-test@dohpass.com`** and **`hgorashy@yahoo.com`** were manually seeded as paid (`is_paid=true`) without ever going through Stripe. They have NULL `stripe_customer_id`. After go-live, if they click "Manage Subscription" on `/account`, they'll get "No active subscription" (404). Acceptable — they're comp'd users, not real paid ones.

- **Stripe API version drift** — `current_period_end` has moved from Subscription root to items in newer Stripe API versions. The webhook handles both. If Stripe keeps moving fields, more places may need the same defensive pattern.

- **Supabase JWT gateway issue** — blocks `verify_jwt=true` at the gateway for user-auth'd functions. All current user-auth'd functions use `verify_jwt=false` + in-function GoTrue verification. Re-enable `verify_jwt=true` gateway-side only after Supabase confirms the ES256/HS256 issue is resolved.

---

## 5. Post-go-live

### Within the first week

- [ ] Monitor `invoice.payment_failed` events (our handler only logs). When the first real one fires, verify the retry flow works (user sees access retained until final cancellation).
- [ ] Monitor `support@dohpass.com` inbox daily
- [ ] Check Stripe Dashboard → Payouts to confirm first payout is scheduled
- [ ] Tax/VAT — if applicable, confirm Stripe Tax is configured before the first real month of revenue
- [ ] Backup the pre-cutover snapshot of `profiles` table (captured automatically in Supabase daily backups)

### Cleanup

- [ ] After 7 days of clean operation, delete the test-mode webhook endpoint in Stripe (Dashboard → test mode → Developers → Webhooks → delete)
- [ ] Keep the test-mode products around for future QA work
- [ ] Close the Supabase support ticket for ES256/HS256 if resolved
- [ ] Kick off the follow-up task for `generate-questions` / `review-questions` / `generate-flashcards` JWT audit

### Document

- [ ] Update `CLAUDE.md` → "Pending Work" — strike through "Paywall with Stripe"; add next roadmap items
- [ ] This file (`docs/STRIPE_GO_LIVE.md`) stays in the repo as a reference for the next project going through a similar cutover
