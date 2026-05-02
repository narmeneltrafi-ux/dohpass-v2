# /edge-drift-audit

Audit deployed Supabase edge functions against the repo source. Detect drift before it causes production bugs.

## Context

DOHPass has had recurring source drift between deployed edge functions and the repo. Functions get hot-patched on Supabase dashboard during incidents and never synced back. This command makes the drift visible weekly so it never compounds.

## Project Constants

- Supabase project ID: `qvzvdwvyihwwiqlhgogq`
- Functions directory: `supabase/functions/`
- Known functions: `keep-alive`, `generate-questions`, `review-questions`, `generate-flashcards`, `create-checkout`, `lemon-squeezy-webhook` (add others as built)

## What to do

1. **List local functions.** Read `supabase/functions/` and enumerate every function directory.

2. **For each function, fetch deployed source via Supabase MCP `get_edge_function`.**

3. **Diff deployed vs local.** For each function, produce one of three verdicts:
   - ✅ **IN SYNC** — identical (ignore whitespace-only differences)
   - ⚠️ **DRIFT DETECTED** — meaningful differences. Show a unified diff (max 40 lines per function, truncate with note if longer).
   - ❌ **DEPLOYED BUT NOT IN REPO** — function exists in production but not locally. Highest priority.
   - ❌ **IN REPO BUT NOT DEPLOYED** — local function never deployed, or was deleted from production.

4. **Output a summary table at the top:**

| Function | Status | Action Needed |
|---|---|---|
| keep-alive | ✅ IN SYNC | None |
| review-questions | ⚠️ DRIFT | Pull deployed → commit as sync |
| ... | ... | ... |

5. **For each DRIFT or MISSING function, recommend the resolution path:**
   - Drift where deployed is newer: pull deployed source into repo, commit as `chore: sync deployed source for <function>`, then PR
   - Drift where repo is newer: do NOT deploy automatically — flag for Huzaifa to confirm intent
   - Deployed-only functions: pull into repo immediately
   - Repo-only functions: ask Huzaifa whether to deploy or delete

6. **Do NOT auto-fix.** This is an audit command, not a sync command. Surface the gaps, let Huzaifa decide.

## Hard Rules

- Never deploy or modify deployed functions during this audit
- Never assume deployed is "right" — sometimes the repo is the source of truth
- If `verify_jwt` differs between deployed and repo config, FLAG IT EXPLICITLY — it's a security boundary
- If the diff touches secret references (env var names), flag separately under "Secret reference changes"

## Output Format

```
# Edge Function Drift Audit — <date>

## Summary
[table from step 4]

## Drift Details

### <function-name> — <status>
[diff or description]

**Recommended action:** <action>

### <next function>
...

## Recommended Next Steps
1. [highest priority sync]
2. [next priority]
...
```

End with a one-line verdict: "0 drifts" or "X drifts — sync before next deploy."
