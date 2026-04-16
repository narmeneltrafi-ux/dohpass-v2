import Stripe from "https://esm.sh/stripe@17.7.0?target=deno&no-check";

// Price ID → plan name mapping
const PRICE_TO_PLAN: Record<string, string> = {
  "price_1TMjzp9oYokhs2iDMYKAdc6c": "gp",
  "price_1TMk0W9oYokhs2iDmzZxIyTh": "specialist",
  "price_1TMk1L9oYokhs2iDnwA0yLuX": "all_access",
};

Deno.serve(async (req) => {
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;

    if (!userId) {
      console.error("No client_reference_id on session");
      return new Response("No user ID", { status: 400 });
    }

    // Retrieve line items to get the price ID
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const priceId = lineItems.data[0]?.price?.id;

    if (!priceId) {
      console.error("No price ID found in line items");
      return new Response("No price ID", { status: 400 });
    }

    const plan = PRICE_TO_PLAN[priceId] || "free";

    // Update the user's profile in Supabase using service role key
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
        body: JSON.stringify({ plan, is_paid: true }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Failed to update profile:", errText);
      return new Response(`DB update failed: ${errText}`, { status: 500 });
    }

    console.log(`Updated user ${userId} to plan: ${plan}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
