-- trigger_conversion_emails() is SECURITY DEFINER, returns integer, and was
-- executable by anon + authenticated — i.e. anyone could POST
-- /rest/v1/rpc/trigger_conversion_emails and fire marketing emails to every
-- eligible user. Only pg_cron (postgres) should run these.
revoke execute on function public.trigger_conversion_emails() from public, anon, authenticated;
revoke execute on function public.trigger_reengagement_emails() from public, anon, authenticated;

-- Trigger-returning function: not callable via RPC, revoked for hygiene.
revoke execute on function public.notify_payment_request_trigger() from public, anon, authenticated;
