import Stripe from "https://esm.sh/stripe@14?target=denonext";

// Price ID → plan name mapping. Unknown prices resolve to null so a
// paying user is never silently bucketed as "free".
const PRICE_TO_PLAN: Record<string, string> = {
  "price_1TMjzp9oYokhs2iDMYKAdc6c": "gp",
  "price_1TMk0W9oYokhs2iDmzZxIyTh": "specialist",
  "price_1TMk1L9oYokhs2iDnwA0yLuX": "all_access",
};

// TODO: Out-of-order event risk not handled — acceptable for v1; revisit
// with event dedup or event.created timestamp check before scale.

type ProfilePatch = {
  plan?: string | null;
  is_paid?: boolean;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

Deno.serve(async (req) => {
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // ── DB helpers ──────────────────────────────────────────────────

  const updateProfileById = async (userId: string, patch: ProfilePatch) => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SB_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Profile PATCH failed: ${errText}`);
    }
  };

  const findProfileIdByStripeCustomerId = async (
    customerId: string,
  ): Promise<string | null> => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
      {
        headers: {
          apikey: SB_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Profile lookup failed: ${await res.text()}`);
    }
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  };

  // ── Event handlers ──────────────────────────────────────────────

  const handleCheckoutCompleted = async (session: Stripe.Checkout.Session) => {
    const userId = session.client_reference_id;
    if (!userId) {
      console.error("checkout.session.completed: no client_reference_id");
      return new Response("No user ID", { status: 400 });
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const priceId = lineItems.data[0]?.price?.id;
    if (!priceId) {
      console.error("checkout.session.completed: no price ID in line items");
      return new Response("No price ID", { status: 400 });
    }

    const plan = PRICE_TO_PLAN[priceId] ?? null;
    if (plan === null) {
      console.warn(`checkout.session.completed: unknown priceId=${priceId} — plan left null`);
    }

    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    await updateProfileById(userId, {
      plan,
      is_paid: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    });

    console.log(
      `checkout.session.completed: user=${userId} plan=${plan} customer=${customerId}`,
    );
    return null;
  };

  const handleSubscriptionUpdated = async (sub: Stripe.Subscription) => {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await findProfileIdByStripeCustomerId(customerId);
    if (!userId) {
      // Orphan: checkout.session.completed hasn't landed yet, or this is
      // test-mode noise for a customer we never created. Returning 200
      // avoids a Stripe retry storm; the next subscription.* event will
      // catch state up once the customer id is linked.
      console.warn(
        `customer.subscription.updated: orphan customer=${customerId} — no matching profile; returning 200`,
      );
      return null;
    }

    const priceId = sub.items.data[0]?.price?.id ?? null;
    const plan = priceId ? PRICE_TO_PLAN[priceId] ?? null : null;
    if (priceId && plan === null) {
      console.warn(
        `customer.subscription.updated: unknown priceId=${priceId} user=${userId}`,
      );
    }

    const patch: ProfilePatch = {
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
    };

    switch (sub.status) {
      case "active":
      case "trialing":
        patch.is_paid = true;
        patch.plan = plan;
        break;

      case "past_due":
      case "unpaid":
        // Retry window — keep access until Stripe gives up.
        console.warn(
          `customer.subscription.updated: retry state user=${userId} status=${sub.status} sub=${sub.id}`,
        );
        patch.is_paid = true;
        patch.plan = plan;
        break;

      case "canceled":
      case "incomplete_expired":
        patch.is_paid = false;
        patch.plan = null;
        break;

      case "incomplete":
      case "paused":
        // Payment not captured — no access.
        patch.is_paid = false;
        patch.plan = null;
        break;

      default:
        console.warn(
          `customer.subscription.updated: unknown status=${sub.status} user=${userId} — is_paid/plan left untouched`,
        );
    }

    await updateProfileById(userId, patch);
    console.log(
      `customer.subscription.updated: user=${userId} status=${sub.status} cap=${sub.cancel_at_period_end}`,
    );
    return null;
  };

  const handleSubscriptionDeleted = async (sub: Stripe.Subscription) => {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await findProfileIdByStripeCustomerId(customerId);
    if (!userId) {
      console.warn(
        `customer.subscription.deleted: orphan customer=${customerId} — no matching profile; returning 200`,
      );
      return null;
    }

    await updateProfileById(userId, {
      is_paid: false,
      plan: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      // stripe_customer_id intentionally preserved — the Stripe customer
      // object survives subscription deletion, and a re-subscribe reuses it.
    });
    console.log(`customer.subscription.deleted: user=${userId} sub=${sub.id}`);
    return null;
  };

  const handleInvoicePaymentFailed = (invoice: Stripe.Invoice) => {
    // Do NOT flip is_paid here. Stripe smart retries run ~3 weeks; the
    // terminal outcome arrives via customer.subscription.updated
    // (past_due → canceled) or customer.subscription.deleted.
    console.error(
      `invoice.payment_failed: customer=${invoice.customer} invoice=${invoice.id} ` +
        `amount_due=${invoice.amount_due} attempt_count=${invoice.attempt_count}`,
    );
  };

  const handleInvoicePaymentSucceeded = (invoice: Stripe.Invoice) => {
    // Audit trail only — subscription.updated already reflects active state.
    console.log(
      `invoice.payment_succeeded: customer=${invoice.customer} invoice=${invoice.id} ` +
        `amount_paid=${invoice.amount_paid}`,
    );
  };

  // ── Dispatch ────────────────────────────────────────────────────

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const early = await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        if (early) return early;
        break;
      }
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }
      case "invoice.payment_succeeded": {
        handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        console.log(`ignoring event type=${event.type}`);
    }
  } catch (err) {
    console.error(`Handler error for ${event.type}:`, err.message);
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
