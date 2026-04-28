-- One row per edge-function invocation (success or failure).
-- service-role only writes; no SELECT policies for now (admin reads via SQL).

create table edge_function_metrics (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  execution_ms int not null,
  batch_size int,
  model text,
  tokens_in int,
  tokens_out int,
  status_code int not null,
  error_message text,
  created_at timestamptz default now()
);

create index edge_function_metrics_function_name_created_at_idx
  on edge_function_metrics (function_name, created_at desc);

alter table edge_function_metrics enable row level security;
