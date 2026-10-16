-- DOHPass funnel report. Run via Supabase MCP execute_sql (service role).
-- Window: change the interval on the first line of each query.
-- Production hosts only; internal/test accounts excluded.

-- 1) Visitor → signup funnel (distinct browsers per step, last 30 days)
with ev as (
  select * from public.funnel_events
  where created_at > now() - interval '30 days'
    and host in ('www.dohpass.com', 'dohpass.com')
)
select step, browsers from (
  select 1 o, 'landing_view'      step, count(distinct anon_id) browsers from ev where event = 'landing_view'
  union all select 2, 'demo_first_answer', count(distinct anon_id) from ev where event = 'demo_first_answer'
  union all select 3, 'demo_complete',     count(distinct anon_id) from ev where event = 'demo_complete'
  union all select 4, 'signup_view',       count(distinct anon_id) from ev where event = 'signup_view'
  union all select 5, 'signup_submitted',  count(distinct anon_id) from ev where event = 'signup_submitted'
  union all select 6, 'pricing_view',      count(distinct anon_id) from ev where event = 'pricing_view'
  union all select 7, 'checkout_view',     count(distinct anon_id) from ev where event = 'checkout_view'
  union all select 8, 'order_placed',      count(distinct anon_id) from ev where event = 'order_placed'
) s order by o;

-- 2) Signup → paid funnel by first-touch channel (accounts created in window)
with real as (
  select u.id, u.created_at, u.email_confirmed_at,
         coalesce(u.raw_user_meta_data->'first_touch'->>'utm_source',
                  u.raw_user_meta_data->'first_touch'->>'ref_host',
                  case when u.raw_user_meta_data ? 'first_touch' then 'direct' else 'unknown (pre-tracking)' end) as channel
  from auth.users u
  where u.created_at > now() - interval '30 days'
    and u.email not ilike '%test%' and u.email not ilike 'huzaifa+%'
    and u.email not ilike '%@dohpass.com%' and u.email not ilike '%claude%'
)
select r.channel,
  count(*)                                                              as signups,
  count(*) filter (where r.email_confirmed_at is not null)             as confirmed,
  count(*) filter (where exists (select 1 from question_attempts qa where qa.user_id = r.id)) as answered_1,
  count(*) filter (where (select count(*) from question_attempts qa where qa.user_id = r.id) >= 10) as hit_free_limit,
  count(*) filter (where (select count(distinct date(qa.created_at)) from question_attempts qa where qa.user_id = r.id) >= 2) as returned_day2,
  count(*) filter (where exists (select 1 from manual_orders mo where mo.user_id = r.id)) as ordered,
  count(*) filter (where exists (select 1 from manual_orders mo where mo.user_id = r.id and mo.status = 'paid')
                      or exists (select 1 from profiles p where p.id = r.id and (p.is_paid or p.access_expires_at > now()))) as paid
from real r
group by r.channel
order by signups desc;
