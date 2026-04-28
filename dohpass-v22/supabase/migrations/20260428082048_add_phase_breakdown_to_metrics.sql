-- Add phase_breakdown for per-invocation timing instrumentation.
-- Used by generate-flashcards (Step 3 instrumentation) and any future
-- observability work where execution_ms alone isn't enough.
--
-- Shape (per current writers): { llm: { count, total_ms, max_ms, avg_ms }, db: { ... } }
alter table edge_function_metrics add column phase_breakdown jsonb;
