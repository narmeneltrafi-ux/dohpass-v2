-- Dead-letter queue for review-questions LLM failures.
--
-- Polymorphic via (table_name, question_id) discriminator — there is no `questions`
-- table; questions live in either `specialist_questions` or `gp_questions`. No FK
-- because PG can't conditionally reference; orphan rows are accepted as tombstones
-- and the cron drainer LEFT JOINs to skip them.
--
-- Lifecycle:
--   pending      → just enqueued by review-questions on LLM/DB failure
--   in_progress  → cron drainer claimed via SELECT FOR UPDATE SKIP LOCKED
--   succeeded    → drainer's retry succeeded; can be reaped
--   failed       → drainer gave up after max attempts

create table review_queue (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('specialist_questions', 'gp_questions')),
  question_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'failed', 'succeeded')),
  attempts int default 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz default now(),
  unique (table_name, question_id)
);

-- Hot path: drainer pulls oldest pending rows.
create index review_queue_pending_idx
  on review_queue (last_attempt_at)
  where status = 'pending';

alter table review_queue enable row level security;
