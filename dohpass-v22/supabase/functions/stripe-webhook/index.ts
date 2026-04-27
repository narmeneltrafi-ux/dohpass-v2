import Stripe from "https://esm.sh/stripe@14?target=denonext";

const PRICE_TO_PLAN: Record<string, string> = {
  "price_1TMjzp9oYokhs2iDMYKAdc6c": "gp",
  "price_1TMk0W9oYokhs2iDmzZxIyTh": "specialist",
  "price_1TMk1L9oYokhs2iDnwA0yLuX": "all_access",
};

const GRACE_PERIOD_DAYS = 3;

type ProfilePatch = {
  plan?: string | null;
  is_paid?: boolean;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  grace_period_end?: string | null;
};

function extractPeriodEnd(sub: unknown): string | null {
  const s = sub as Record<string, unknown>;
  if (typeof s.current_period_end === "number") {
    return new Date(s.current_period_end * 1000).toISOString();
  }
  const items = s.items as { data?: Array<Record<string, unknown>> } | undefined;
  const firstItem = items?.data?.[0];
  if (firstItem && typeof firstItem.current_period_end === "number") {
    return new Date(firstItem.current_period_end * 1000).toISOString();
  }
  return null;
}

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

  // --- Idempotency: skip already-processed events ---
  const dedupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/stripe_events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ event_id: event.id }),
    },
  );
  // 409 Conflict = duplicate event, return 200 to Stripe
  if (dedupRes.status === 409) {
    console.log(`Duplicate event ignored: ${event.id}`);
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!dedupRes.ok) {
    const errText = await dedupRes.text();
    console.error(`stripe_events INSERT failed: ${errText}`);
    // Non-fatal: continue processing even if dedup insert fails
  }

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

    const plan = PRICE_TO_PLAN[priceId] ?? "free";
    if (!(priceId in PRICE_TO_PLAN)) {
      console.warn(`checkout.session.completed: unknown priceId=${priceId} — defaulting plan='free'`);
    }

    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    let currentPeriodEnd: string | null = null;
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        currentPeriodEnd = extractPeriodEnd(sub);
      } catch (err) {
        console.warn(`checkout.session.completed: could not fetch sub ${subscriptionId}: ${err.message}`);
      }
    }

    await updateProfileById(userId, {
      plan,
      is_paid: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      current_period_end: currentPeriodEnd,
      grace_period_end: null, // clear any leftover grace period on fresh purchase
    });

    console.log(`checkout.session.completed: user=${userId} plan=${plan} customer=${customerId} period_end=${currentPeriodEnd}`);
    return null;
  };

  const handleSubscriptionUpdated = async (sub: Stripe.Subscription) => {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await findProfileIdByStripeCustomerId(customerId);
    if (!userId) {
      console.warn(`customer.subscription.updated: orphan customer=${customerId} — no matching profile; returning 200`);
      return null;
    }

    const priceId = sub.items.data[0]?.price?.id ?? null;
    const plan = priceId && PRICE_TO_PLAN[priceId] ? PRICE_TO_PLAN[priceId] : "free";
    if (priceId && !(priceId in PRICE_TO_PLAN)) {
      console.warn(`customer.subscription.updated: unknown priceId=${priceId} user=${userId} — defaulting plan='free'`);
    }

    const currentPeriodEnd = extractPeriodEnd(sub);
    if (currentPeriodEnd === null) {
      console.warn(`customer.subscription.updated: no current_period_end found on sub=${sub.id} — leaving NULL`);
    }

    const patch: ProfilePatch = {
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
    };

    switch (sub.status) {
      case "active":
      case "trialing":
        patch.is_paid = true;
        patch.plan = plan;
        patch.grace_period_end = null; // payment recovered, clear grace
        break;
      case "past_due":
      case "unpaid":
        // Grace period is set by invoice.payment_failed — don't override is_paid here
        console.warn(`customer.subscription.updated: retry state user=${userId} status=${sub.status}`);
        break;
      case "canceled":
      case "incomplete_expired":
        patch.is_paid = false;
        patch.plan = "free";
        patch.grace_period_end = null;
        break;
      case "incomplete":
      case "paused":
        patch.is_paid = false;
        patch.plan = "free";
        patch.grace_period_end = null;
        break;
      default:
        console.warn(`customer.subscription.updated: unknown status=${sub.status} user=${userId}`);
    }

    await updateProfileById(userId, patch);
    console.log(`customer.subscription.updated: user=${userId} status=${sub.status} period_end=${currentPeriodEnd}`);
    return null;
  };

  const handleSubscriptionDeleted = async (sub: Stripe.Subscription) => {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await findProfileIdByStripeCustomerId(customerId);
    if (!userId) {
      console.warn(`customer.subscription.deleted: orphan customer=${customerId} — no matching profile; returning 200`);
      return null;
    }
    await updateProfileById(userId, {
      is_paid: false,
      plan: "free",
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      grace_period_end: null, // hard cut — no grace on explicit cancellation
    });
    console.log(`customer.subscription.deleted: user=${userId} sub=${sub.id}`);
    return null;
  };

  const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as { id: string })?.id ?? null;
    if (!customerId) {
      console.error("invoice.payment_failed: no customer ID on invoice");
      return;
    }
    const userId = await findProfileIdByStripeCustomerId(customerId);
    if (!userId) {
      console.warn(`invoice.payment_failed: orphan customer=${customerId} — no matching profile`);
      return;
    }
    const gracePeriodEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await updateProfileById(userId, { grace_period_end: gracePeriodEnd });
    console.log(
      `invoice.payment_failed: user=${userId} customer=${customerId} invoice=${invoice.id} ` +
      `attempt=${invoice.attempt_count} grace_until=${gracePeriodEnd}`,
    );
  };

  const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as { id: string })?.id ?? null;
    if (!customerId) return;
    const userId = await findProfileIdByStripeCustomerId(customerId);
    if (!userId) return;
    // Payment recovered — clear grace period and ensure is_paid is true
    await updateProfileById(userId, { grace_period_end: null, is_paid: true });
    console.log(`invoice.payment_succeeded: user=${userId} customer=${customerId} grace_period cleared`);
  };

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
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }
      case "invoice.payment_succeeded": {
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
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
