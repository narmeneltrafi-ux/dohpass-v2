-- Fire a single notification email when a new manual bank-transfer order is
-- placed, so an order never sits in `pending` unseen. Mirrors the
-- trigger_reengagement_emails net.http_post pattern (shared CRON_SECRET from
-- vault). Fire-and-forget via pg_net — does not block the INSERT and never
-- fails the user's order if the mail hop is down.
--
-- Paired edge function: supabase/functions/notify-manual-order (verify_jwt=false,
-- x-cron-secret gated, sends via Resend to support@dohpass.com).

CREATE OR REPLACE FUNCTION public.notify_manual_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets
   WHERE name = 'CRON_SECRET'
   LIMIT 1;

  -- If the secret is missing, don't break order creation — just skip the alert.
  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE WARNING 'notify_manual_order: CRON_SECRET missing from vault; skipping alert for %', NEW.payment_reference;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://qvzvdwvyihwwiqlhgogq.supabase.co/functions/v1/notify-manual-order',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', cron_secret
               ),
    body    := jsonb_build_object(
                 'reference', NEW.payment_reference,
                 'amountAed', NEW.amount_aed,
                 'email',     NEW.user_email,
                 'createdAt', NEW.created_at::text
               )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_manual_order ON public.manual_orders;

CREATE TRIGGER trg_notify_manual_order
AFTER INSERT ON public.manual_orders
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_manual_order();

-- Trigger function is invoked by the DB on INSERT, not via the API.
REVOKE EXECUTE ON FUNCTION public.notify_manual_order() FROM PUBLIC, anon, authenticated;
