-- Minimal first-party funnel events.
-- Writes ONLY via log_funnel_event (SECURITY DEFINER). Table has RLS on, zero
-- policies, and no grants to anon/authenticated — clients cannot read or write
-- it directly. Service role (MCP/SQL) reads it for reporting.

create table if not exists public.funnel_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event      text not null,
  anon_id    text not null,
  user_id    uuid,
  path       text,
  host       text,
  props      jsonb not null default '{}'::jsonb
);

alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;

create index if not exists funnel_events_event_created_idx on public.funnel_events (event, created_at);
create index if not exists funnel_events_anon_idx on public.funnel_events (anon_id, event, created_at);

create or replace function public.log_funnel_event(
  p_event   text,
  p_anon_id text,
  p_path    text  default null,
  p_host    text  default null,
  p_props   jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Whitelist: unknown event names are silently dropped.
  if p_event not in (
    'landing_view','demo_first_answer','demo_complete',
    'signup_view','signup_submitted','pricing_view','checkout_view','order_placed'
  ) then
    return;
  end if;

  if p_anon_id is null or length(p_anon_id) = 0 or length(p_anon_id) > 64 then
    return;
  end if;

  -- Cheap flood guard: same browser + same event within 5 s is dropped.
  if exists (
    select 1 from public.funnel_events
    where anon_id = p_anon_id and event = p_event
      and created_at > now() - interval '5 seconds'
  ) then
    return;
  end if;

  if p_props is null or length(p_props::text) > 1000 then
    p_props := '{}'::jsonb;
  end if;

  insert into public.funnel_events (event, anon_id, user_id, path, host, props)
  values (p_event, p_anon_id, auth.uid(), left(p_path, 200), left(p_host, 100), p_props);
end;
$$;

revoke all on function public.log_funnel_event(text, text, text, text, jsonb) from public;
grant execute on function public.log_funnel_event(text, text, text, text, jsonb) to anon, authenticated;
