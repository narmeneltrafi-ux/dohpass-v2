# /post-deploy-verify

Verify a production deploy is healthy across the full stack — Vercel build, frontend runtime, Supabase edge functions, and database. Eliminates the tab-switching dance after every merge.

## Context

DOHPass auto-deploys to Vercel on merge to `main`. Currently, verification means opening Vercel dashboard, then Supabase dashboard, then the live URL, then back to Supabase logs. This command consolidates all of that into a single check.

## Project Constants

- Vercel project: `dohpass-v2-pthr`
- Supabase project ID: `qvzvdwvyihwwiqlhgogq`
- Production URL: `dohpass.com` (and Vercel preview URL pattern)
- Edge functions to monitor: `generate-questions`, `review-questions`, `generate-flashcards`, `create-checkout`, `stripe-webhook`, `create-portal-session` (add `lemon-squeezy-webhook` once built)

## What to do

### 1. Vercel deployment status
- Use Vercel MCP `list_deployments` for project `dohpass-v2-pthr`
- Get the most recent deployment
- Confirm status = `READY`
- If status = `BUILDING`: wait 30s, recheck. Max 3 attempts (90s total). If still building after that, report and exit.
- If status = `ERROR`: pull build logs via `get_deployment_build_logs`, surface the error, stop.
- Capture the deployment URL

### 2. Build log review
- Pull build logs for the latest deployment
- Flag any warnings (TypeScript errors suppressed, missing env vars, deprecated package warnings)
- Flag any non-fatal errors that snuck through

### 3. Frontend smoke test
- Use `web_fetch_vercel_url` (Vercel MCP) on the production URL
- Confirm 200 response
- Confirm the response body contains expected markers (e.g., page title contains "DOHPass", login link present)
- If 4xx or 5xx, flag immediately

### 4. Supabase edge function logs (last 5 min)
- Use Supabase MCP `get_logs` with service `edge-function`
- Filter to last 5 minutes
- Count errors by function
- Flag any:
  - 5xx responses
  - Timeout errors (function exceeded 150s)
  - Secret-not-found errors (env var missing)
  - JWT verification failures (especially on webhooks where verify_jwt should be false)

### 5. Supabase Postgres logs (last 5 min)
- Use Supabase MCP `get_logs` with service `postgres`
- Filter to errors only
- Flag any RLS policy violations (often indicates frontend trying to access data it shouldn't)
- Flag any constraint violations or deadlocks

### 6. Auth log spot-check
- Use Supabase MCP `get_logs` with service `auth`
- Last 5 minutes
- Flag spike in failed sign-ins (could indicate auth flow broken by deploy)

## Output format

```
# Post-Deploy Verify — <timestamp>

## Verdict: ✅ HEALTHY  /  ⚠️ DEGRADED  /  ❌ BROKEN

## Vercel
- Deployment: <id> (READY / ERROR / BUILDING)
- Build time: <duration>
- URL: <url>
- Build warnings: <count, with samples if any>

## Frontend smoke test
- Status: <200 / 4xx / 5xx>
- Markers present: <yes/no>

## Supabase — last 5 minutes
| Function | Invocations | Errors | Notes |
|---|---|---|---|
| ... | | | |

## Postgres
- Errors: <count>
- RLS violations: <count, with table names if any>

## Auth
- Failed sign-ins: <count>
- Anomaly: <yes/no>

## Verdict reasoning
<2-3 sentences>

## Recommended action (if not HEALTHY)
<specific next step>
```

## Hard rules

- Read-only across all MCPs. Never trigger redeploys, rollbacks, or modify deployed state automatically.
- If the verdict is ❌ BROKEN, do NOT suggest auto-rollback — surface the issue and let Huzaifa decide whether to rollback, hotfix, or investigate further.
- If logs contain secret material in error messages (JWTs, API keys, webhook secrets), redact before output.
- Never claim ✅ HEALTHY without all six checks passing — partial verification is worse than no verification because it creates false confidence.

## When to run

- After every merge to main, ~2 minutes post-merge (Vercel build window)
- Before closing the laptop on a deploy session
- When investigating a "something feels off" report from a user
