# DOHPass — Expert Panel Review (2026-07-01)

Engineering review only. Content quality out of scope. Findings verified against the
live Supabase project `qvzvdwvyihwwiqlhgogq`, deployed edge functions, and the repo at
`9a06b3f`. No code changed — this is a prioritized findings report.

Hard constraints honored: no RLS disable suggested, no `hasAccess()`/`PaidRoute` bypass,
no payment processor, no committed secrets, edge functions diffed before any comment.

---

## 1. Fix this week

| # | Finding | Tag | Effort | Why it made the cut |
|---|---------|-----|--------|---------------------|
| 1 | **Manual-order pipeline is blind.** `createManualOrder()` inserts a `pending` row and nothing else fires — no email, no webhook, no dashboard. Right now `osideig@gmail.com` (×2, Jun 26) and `dr.mohmedjumah@gmail.com` (Jun 28) sit `pending` 3–5 days. Either they paid and are locked out, or they abandoned — and no one is alerted either way. | **[REVENUE-BLOCKING]** | M | This *is* the revenue rail. A silent order queue means paid, ready-to-study customers churn while the founder doesn't know an order exists. |
| 2 | **20 questions flagged `needs_review=true` are still `is_active=true`** (14 specialist, 6 GP) — questions the reviewer flagged as *possibly wrong answer* are being served to paying users. | **[RISK]** | S | Wrong-answer questions to a licensing-exam customer is the fastest way to a refund + bad review. Cheap to gate: `is_active=false where needs_review`. |
| 3 | **Content/review crons are not scheduled at all.** Only `keep-alive` (01:00), `reengagement-emails` (06:00), `expire-lapsed-access` (00:00) exist in `cron.job`. `generate-questions` / `review-questions` / `generate-flashcards` are gone; `function_logs` is empty for 30 days. Result: 2,290 questions never reviewed, 27 rows stuck `pending` in `review_queue` (the drainer in `review-questions/index.ts` was never deployed — it's still a comment block). | **[RISK]** | S | Confirm intentional (bank is feature-complete) vs. drift. If intentional, delete the dead drainer + archive `review_queue`. If not, the review loop is silently dark. |
| 4 | **`answer_remap_proposals` has RLS disabled** (advisor ERROR `rls_disabled_in_public`) and admin-only `SECURITY DEFINER` RPCs `get_audit_candidates` / `get_blueprint_coverage` are executable by the `anon` role. God-mode internals are reachable unauthenticated. | **[RISK]** | S | Directly violates the never-disable-RLS constraint on one table today, and leaks question-bank audit internals to anon. Enable RLS + `REVOKE EXECUTE ... FROM anon`. |
| 5 | **No bundle splitting.** Single `645 KB` JS chunk (`178 KB` gzip), zero `lazy()`/`Suspense`, no `manualChunks`. Every mobile visitor downloads GodMode agents, Tutor, MockExam before seeing the landing hero. | **[POLISH]** | M | Most candidates study on a phone. First-load JS is the Core Web Vitals lever with the clearest conversion link. Route-level `lazy()` + a vendor chunk is a one-afternoon win. |

---

## 2. Backlog

- **enhance-explanation CORS is `*`** — still wildcarded (deployed v1 == repo). JWT-gated so real exposure is low. **[POLISH]**
- **Disposable email not blocked at signup** — `mailinator` etc. filtered only in re-engagement send, not at `signUp()`. No domain blocklist anywhere. **[RISK]**
- **Stripe dead code still live** — `create-checkout` (v35), `stripe-webhook` (v35), `create-portal-session` (v12) are ACTIVE/reachable; `Pricing.jsx` + `Account.jsx` read `VITE_STRIPE_PRICE_*`; `@stripe/stripe-js` still in `package.json`. Payments are permanently manual — this is confusing attack surface, not a TODO to wire up. Remove endpoints, envs, dep, and the `// STRIPE CHECKOUT` block in `supabase.js`. (`LEMON_SQUEEZY_WEBHOOK_SECRET` — no repo reference found; verify it's gone from Supabase secrets.) **[POLISH]**
- **Landing stats still client-side** — `fetchLandingStats()` does anon direct-reads that RLS blocks, then falls back to a hardcoded `SPECIALTIES_ANON_FLOOR = 10`. The promised `SECURITY DEFINER` RPC was never added; `get_question_counts` covers counts but not specialties/last-updated. **[POLISH]**
- **`keep-alive` cron uses a literal `"your-anon-key"` placeholder** — the request 401s but `net.http_get` still reports success. It likely still prevents project pause (any request counts) but isn't doing what it reads like. **[POLISH]**
- **7 `function_search_path_mutable` + 2 `SECURITY DEFINER` views** (`v_proposals_review`, `v_audit_runs_summary`, advisor ERROR) + **leaked-password protection disabled** (HaveIBeenPwned toggle off in Auth). **[RISK/POLISH]**
- **Inactive-row bloat** — `specialist_questions` 4,063 rows / 2,439 active; `gp_questions` 1,824 / 977. ~40% soft-deleted rows dragging every `fetchAllRows` full-table scan (`fetchSpecialistQuestions` pulls all rows to the client, then filters in JS). At 10× volume this is the first thing to hurt. **[RISK]**
- **`pg_net` / `pg_trgm` installed in `public` schema** (advisor WARN). **[POLISH]**
- **Test users in prod** — `e2e-test@dohpass.com` still carries 93 attempts. `claude-retest@example.com` and `dohpasstest@mailinator.com` are already clean (0/0), so the "retest progress wipe" item is effectively done except for the e2e account. **[POLISH]**

---

## 3. Panel disagreements

- **Security vs. Growth on enhance-explanation CORS:** Security wanted it top-5; Growth overruled — it's JWT-gated, zero conversion impact, demoted to backlog `[POLISH]`.
- **Backend vs. Product on the missing content crons:** Backend read it as drift/outage; Product argued a feature-complete 3,400-question bank *should* have generation off, and the real bug is the un-archived `review_queue` + dead drainer code pretending to be live. Both agree the 20 flagged-but-active questions (finding #2) are a real bug regardless.
- **QA vs. Product on manual-order observability:** Product flagged risk of over-building a "notification system"; QA (with Growth backing) held firm that a single insert-trigger email is the minimum bar when it's the *only* revenue rail. Kept as #1, scoped to one alert — not a dashboard.

---

## 4. Status of known open items

| Item | Status |
|------|--------|
| `enhance-explanation` CORS wildcard | **Still open** (`*`, low impact) |
| Bare-domain DNS A → `216.198.79.1` | **Fixed** — `dohpass.com` now resolves to `216.198.79.1` |
| `review-questions` deployed-vs-repo drift | **No drift** — deployed v34 matches repo. Open question is archive vs. keep the dead drainer/queue |
| `AuthPage.jsx` unconditional email-check display | **Fixed** — confirm screen now gated on `!data.session` |
| `deviceSession.js` `.single()` → `.maybeSingle()` | **Fixed** — line 71 uses `.maybeSingle()` with null guards |
| Dead Stripe / Lemon Squeezy env vars | **Still open** — Stripe code + endpoints + envs remain; Lemon secret not in repo (verify in Supabase) |
| Retest-user progress wipe | **Mostly done** — retest accounts clean; only `e2e-test@dohpass.com` (93 attempts) remains |
| Disposable email block at signup | **Still open** — no blocklist |
| SECURITY DEFINER RPC for landing stats | **Still open** — client fallback floor still in use |
| Bundle splitting | **Still open** — single 645 KB chunk |

> Zero payment-processor recommendations appear in this report, by design.
