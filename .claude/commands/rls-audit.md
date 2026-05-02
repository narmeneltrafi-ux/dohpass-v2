# /rls-audit

Audit Row-Level Security policies across all DOHPass tables. Find gaps, weak policies, and tables that shouldn't be exposed.

## Context

DOHPass content is gated by RLS. A single weak policy = entire content bank scrapeable by an anon user. This is the primary moat. Audit weekly, before launch milestones, and after any schema change.

## Project Constants

- Supabase project ID: `qvzvdwvyihwwiqlhgogq`
- Critical tables: `profiles`, `questions`, `flashcards`, `attempts`, `flashcard_reviews`, `device_sessions`, `stripe_events` (or LS equivalent)
- Anon role MUST return `[]` for all paid content tables

## What to do

1. **Enumerate all tables** in `public` schema via Supabase MCP `list_tables`.

2. **For each table, check:**
   - Is RLS enabled? (If not: ❌ HARD FAIL)
   - List all policies (SELECT, INSERT, UPDATE, DELETE) via `execute_sql` query against `pg_policies`
   - Test policy logic — flag any policy with `USING (true)` or `WITH CHECK (true)` on tables containing user/content/payment data

3. **Specific table-level checks:**

   **`profiles`:**
   - SELECT: own row only (`auth.uid() = id`)
   - UPDATE: column allowlist enforced — currently only `full_name` editable by user
   - INSERT: triggered by auth signup, not user-initiated
   - DELETE: should be denied or auth-trigger only
   - Any policy allowing user to modify `is_paid`, `subscription_status`, `expiry_date`, or similar = ❌ HARD FAIL

   **`questions` / `flashcards`:**
   - SELECT: paid users get all, free users get only `is_preview = true` rows, anon gets nothing
   - INSERT/UPDATE/DELETE: service role only (used by edge functions)
   - Any policy allowing authenticated users to write = ❌ HARD FAIL

   **`attempts` / `flashcard_reviews`:**
   - SELECT: own rows only
   - INSERT: own rows only (`auth.uid() = user_id`)
   - UPDATE/DELETE: own rows only, or denied entirely

   **`device_sessions`:**
   - SELECT: own sessions only
   - INSERT/UPDATE/DELETE: own sessions only or service role

   **Payment events (`stripe_events` / `lemon_squeezy_events`):**
   - SELECT: service role only — users should never read this
   - INSERT: service role only (webhook)
   - UPDATE/DELETE: deny

4. **Anon role smoke test:**
   - Use Supabase MCP `execute_sql` with anon JWT context
   - SELECT from `questions`, `flashcards` — must return `[]` or only `is_preview = true` rows
   - SELECT from `profiles`, `attempts` — must return `[]`
   - If any returns paid content: ❌ HARD FAIL

5. **Output report:**

```
# RLS Audit — <date>

## Verdict: ✅ CLEAN  /  ⚠️ MINOR ISSUES  /  ❌ HARD FAILURES

## Tables
| Table | RLS | Policies | Verdict |
|---|---|---|---|
| profiles | ✅ | 3 (SELECT, UPDATE, INSERT) | ✅ |
| questions | ✅ | 2 | ⚠️ See note |
| ... | | | |

## Issues Found

### ❌ HARD FAILURES
- [list with table name, policy name, exact issue]

### ⚠️ MINOR ISSUES
- [list]

## Anon smoke test
- questions: returned X rows (expected 0 or preview-only)
- flashcards: returned X rows (expected 0 or preview-only)
- profiles: returned X rows (expected 0)

## Recommended actions
1. [highest priority fix]
2. [next]
```

## Hard Rules

- Never apply fixes during the audit. Surface only.
- Never test with the service role key — that bypasses RLS by design and gives false positives.
- If the audit can't be completed (e.g., MCP timeout), say so explicitly. Don't return a partial pass.
