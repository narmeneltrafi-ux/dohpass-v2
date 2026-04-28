# Step 4 cron-secret rollout — runbook

Companion doc to PR #28 (`fix(edge): cron-secret gate on all 3 generation fns + bump review max_tokens`). The PR ships **only the function code change**. The rollout — generating the secret, setting it as a Supabase secret, updating `cron.job` rows, redeploying, and verifying — happens after merge and follows the strict order below.

## Strict rollout order

The order is non-negotiable. Skipping the verification gate or running steps out of order can break the cron and require a panic rollback.

### a. Capture pre-change state (mandatory)

Before touching anything, snapshot what we're about to change. Every snapshot goes into a comment on the PR before proceeding to the next step. **No rollback is possible without this snapshot.**

1. **Edge function source** for each function. Capture the full deployed source via the Supabase MCP `get_edge_function` for `generate-questions`, `review-questions`, `generate-flashcards`. Paste each `files[0].content` and the `version` number into a PR comment titled "Pre-deploy edge fn snapshot".

2. **`cron.job` rows**. Capture the exact pre-update command strings:
   ```sql
   select jobname, schedule, command, active
   from cron.job
   where jobname in ('daily-generate-questions', 'daily-review-questions', 'daily-generate-flashcards')
   order by jobname;
   ```
   Paste full output into a PR comment titled "Pre-update cron.job snapshot". The `command` strings contain a service-role JWT — flag the comment as containing a secret if your repo has private comments, or redact the JWT body before pasting.

### b. Generate the secret and set it as a Supabase secret

1. Generate locally: `openssl rand -hex 32` (64-char lowercase hex).
2. Set as a Supabase project secret named **`CRON_SECRET`** via the Supabase dashboard (Project Settings → Edge Functions → Add secret) or `supabase secrets set CRON_SECRET=<value>` from the `dohpass-v22/` directory.
3. Verify the secret is present (without displaying value) — Supabase dashboard shows the key name, not the value.

The secret value is **not** committed to the repo. It is **not** pasted into PR comments. It only ever exists in: the maintainer's terminal at generation time, the Supabase secret store, and the `cron.job.command` headers (which are visible to anyone with `cron.job` read access — see "Open issue" below).

### c. Update `cron.job` rows with the new `x-cron-secret` header

Run a single `UPDATE` per row, OR a batched UPDATE. The `command` is a literal SQL string containing a `net.http_post(...)` call with a `headers` jsonb. We add a new key without removing the existing `Authorization` header.

Pseudocode (the actual SQL is built locally with the captured pre-state and the new secret value):

```sql
update cron.job
set command = replace(
  command,
  '"Authorization":"Bearer eyJhbGciOiJIUzI1NiIs...',
  '"Authorization":"Bearer eyJhbGciOiJIUzI1NiIs...","x-cron-secret":"<SECRET_VALUE>"'
)
where jobname in ('daily-generate-questions', 'daily-review-questions', 'daily-generate-flashcards');
```

(Or build the new header jsonb cleanly and replace the whole `headers:='...'::jsonb` substring. Either is fine — the verification gate at step (d) catches escaping mistakes.)

### d. Verification gate — STOP and confirm before any deploy

Run:
```sql
select jobname, command
from cron.job
where jobname in ('daily-generate-questions', 'daily-review-questions', 'daily-generate-flashcards')
order by jobname;
```

Paste full output into the PR. Wait for explicit maintainer approval that:
- All 3 rows show the new `x-cron-secret` header.
- The header value is the same across all 3.
- The `Authorization` header is still present and unchanged.
- JSON escaping is valid (no doubled-up quotes, no broken jsonb).

**Do not proceed to step (e) without this confirmation.** The function is about to start rejecting calls that lack the secret; if cron rows weren't updated correctly, the next scheduled tick will 401 silently and the user-facing impact (no new questions generated) won't surface for 24h.

### e. Deploy the 3 functions via MCP

`deploy_edge_function` for each of `generate-questions`, `review-questions`, `generate-flashcards`. Preserve `verify_jwt: false` (the gateway-level setting is irrelevant now — the in-function secret check is the gate). Note the new version numbers in a PR comment titled "Post-deploy versions".

### f. Smoke test all three secret states

For each of the 3 functions, run three curl tests:

| Test | Expected | Notes |
|---|---|---|
| Correct `x-cron-secret` header | 200 (or 429 rate-limited) | Confirms gate accepts valid secret |
| Wrong `x-cron-secret` value | 401 | Confirms constant-time mismatch path |
| No `x-cron-secret` header | 401 | Confirms missing-header path |

Paste 9 results (3 tests × 3 functions) into the PR. Any deviation → rollback (see below) and investigate.

### g. Wait for natural cron tick (24h verification)

The first scheduled cron run after rollout is `daily-generate-questions` at 02:00 UTC. Verify in `function_logs`:
```sql
select status, message, created_at
from function_logs
where function_name = 'generate-questions'
  and created_at > now() - interval '2 hours'
order by created_at desc
limit 5;
```

Expect to see `started`, `success` × N, `completed` (or partial-results path). If 401 or no log entry at all → cron is broken, rollback.

Repeat verification 24h later for `daily-review-questions` (03:00 UTC) and `daily-generate-flashcards` (04:00 UTC).

---

## Rollback playbook

Two independent rollback paths because the function deploy and the cron.job UPDATE are two distinct mutations.

### Rollback path 1: edge function deploy went wrong

**Trigger:** smoke test (step f) shows 401 for the correct-secret case, or post-deploy logs show unexpected 5xx, or the cron tick at step (g) returns 401.

**Action:**
1. Pull the `Pre-deploy edge fn snapshot` from the PR comment captured in step (a).
2. Re-deploy each function via `deploy_edge_function` MCP, passing the snapshotted source as `files[0].content`. This will create a new version (e.g., v34) that is byte-identical to the pre-Step-4 deployed version (e.g., v33).
3. Verify `get_edge_function` returns the rolled-back source.
4. Smoke test the cron call manually to confirm 200.
5. Investigate the deploy failure before retrying.

**Why this works:** Supabase MCP `deploy_edge_function` always creates a forward version. There is no built-in version-pin or rollback API. The way to "rollback" is to re-deploy old source. The snapshot from step (a) is what makes this possible.

### Rollback path 2: cron.job UPDATE went wrong

**Trigger:** verification gate at step (d) shows malformed JSON in `command`, OR step (g) shows 401 with the correct secret (indicating a header mismatch, not a deploy issue).

**Action:**
1. Pull the `Pre-update cron.job snapshot` from the PR comment captured in step (a).
2. For each affected row, run:
   ```sql
   update cron.job
      set command = '<original command from snapshot, exactly as captured>'
    where jobname = '<jobname>';
   ```
   Each row's command is a single string — paste verbatim from the snapshot.
3. Re-run the SELECT from step (d) to confirm the command is restored.

**Why this works:** `cron.job.command` is plain text. Restoring is just an UPDATE with the captured value. The catch is that `command` strings contain doubled single-quotes from PostgreSQL escaping; paste them with the same escaping, or use parameterized SQL (recommended) so the maintainer client handles the escaping.

### Combined rollback (both)

If both the deploy AND the cron UPDATE need rollback (e.g., something fundamentally wrong with the design), run path 2 first (restore cron), then path 1 (restore function). This order ensures the cron is calling the older function with the older Authorization-only header — the matched pre-Step-4 state.

After full rollback, the `CRON_SECRET` Supabase secret can be left in place (unused) or removed. It costs nothing to keep.

---

## Open issue (out of scope, noted for follow-up)

After this rollout, the long-lived service-role JWT in `cron.job.command` is still present (used as the `Authorization: Bearer ...` value), even though the function no longer relies on it for auth. Anyone with `cron.job` read access can still extract that JWT.

The maintainer's queued **"rotate Supabase service key"** task should:
1. Drop the `Authorization: Bearer ...` header from the 3 cron commands.
2. Rotate the service role key independently.

After that, the cron rows contain only `x-cron-secret: <value>` and the JWT exposure is closed. Tracking outside this PR.
