# /pre-deploy-check

Run before merging any PR to main. Catches the recurring failure modes that have caused production bugs in DOHPass.

## Context

DOHPass is live with real users. Every merge to main auto-deploys to Vercel. This command is the gate — refuse to bless a deploy if any check fails.

## Checks (run in order, fail fast)

### 1. No secrets in diff
Scan the diff for:
- Anything matching `eyJ[A-Za-z0-9_-]{20,}` (JWT pattern) — service role keys, anon keys, cron secrets
- Anything matching `sk_live_`, `sk_test_`, `pk_live_`, `pk_test_` (Stripe keys, even though Stripe is deferred)
- Anything matching `lmsq_` (Lemon Squeezy keys)
- Plain occurrences of `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `LEMON_SQUEEZY_WEBHOOK_SECRET` outside of `Deno.env.get()` calls or env var documentation
- Long base64-looking strings in `.env`, `.env.local`, or any committed file

If found: **HARD FAIL.** Do not proceed. Tell Huzaifa exactly which file and line.

### 2. Edge function deploy hygiene
For any edge function changed in the diff:
- Confirm `verify_jwt: false` is explicitly set in deploy config (not default)
- Confirm batch_size ≤ 4 if the function uses batching (150s timeout constraint)
- Confirm `apply_migration` was used if SQL schema changed (not just `execute_sql`)
- Confirm no direct calls to `cron.job` table without going through migration

If any fail: **WARN.** Surface the issue and ask Huzaifa to confirm before merge.

### 3. RLS not weakened
For any SQL migration or policy change in the diff:
- No `DISABLE ROW LEVEL SECURITY` statements
- No `DROP POLICY` without an immediate replacement `CREATE POLICY`
- No `USING (true)` on tables that contain user data, content, or payment state
- UPDATE policies on `profiles` table must use column allowlist (currently: `full_name` only)

If any fail: **HARD FAIL.**

### 4. hasAccess() / PaidRoute not bypassed
Search the diff for:
- New routes or pages added without `<PaidRoute>` wrapper (unless explicitly free-tier)
- New `is_paid` direct checks outside the `hasAccess()` helper
- Any `// TODO: add paywall` or similar deferral comments

If found: **WARN.** List each one for Huzaifa to confirm.

### 5. Env var sync
For any new env var referenced in the diff:
- Confirm it's documented (in README or `.env.example`)
- Remind Huzaifa to set it in Vercel + Supabase secrets + cron.job before merge

### 6. Frontend build sanity
- Run `npm run build` (or equivalent)
- If build fails: **HARD FAIL** with the error
- If build succeeds with warnings: surface the warnings briefly

### 7. Hard blocker check
Confirm with the current state:
- Is `SUPABASE_SERVICE_ROLE_KEY` rotated yet? (Tracked as pending in project knowledge.) If this PR touches anything that uses it, flag the rotation as still pending.
- Is Lemon Squeezy live? If this PR touches checkout flow, confirm test vs live mode handling.

## Output Format

```
# Pre-Deploy Check — <branch-name>

## Verdict: ✅ PASS  /  ⚠️ PASS WITH WARNINGS  /  ❌ FAIL

## Hard checks
- [✅/❌] No secrets in diff
- [✅/❌] RLS not weakened
- [✅/❌] Build succeeds

## Warnings
- [list]

## Reminders
- [env var sync, manual steps, etc.]

## Verdict reasoning
[2-3 sentences]
```

## Hard Rule

If verdict is ❌ FAIL, do not proceed to merge. Tell Huzaifa what to fix and re-run after.
