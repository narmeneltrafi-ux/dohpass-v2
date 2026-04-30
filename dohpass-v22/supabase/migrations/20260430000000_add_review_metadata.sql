-- Adds review_metadata jsonb column to question banks for the one-off
-- bulk review pass (scripts/bulk-review.ts). Stores the full Sonnet
-- review JSON per row so the clinical pass after has the audit trail
-- (guideline cited, Pearson VUE violations, confidence). Additive,
-- nullable, no default — safe to apply on a live table.

ALTER TABLE specialist_questions
  ADD COLUMN IF NOT EXISTS review_metadata jsonb;

ALTER TABLE gp_questions
  ADD COLUMN IF NOT EXISTS review_metadata jsonb;
