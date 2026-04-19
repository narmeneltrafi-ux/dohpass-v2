import Stripe from "https://esm.sh/stripe@17.7.0?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Look up the caller's stripe_customer_id from their profile, if any.
// Returns null on any failure — caller falls back to the email flow.
async function lookupStripeCustomerId(userId: string): Promise<string | null> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SB_SERVICE_ROLE_KEY) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
      {
        headers: {
          apikey: SB_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ stripe_customer_id: string | null }>;
    return rows[0]?.stripe_customer_id ?? null;
  } catch {
    return null;
  }
}

// Stripe returns this shape when you pass `customer: cus_xxx` for a
// customer that no longer exists (deleted from dashboard, wrong mode,
// wrong account).
function isStripeCustomerMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: string; code?: string; message?: string; param?: string };
  return (
    e.type === "StripeInvalidRequestError" &&
    (e.code === "resource_missing" || /No such customer/i.test(e.message ?? ""))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

    const { priceId, userId, userEmail } = await req.json();

    if (!priceId || !userId) {
      return new Response(JSON.stringify({ error: "Missing priceId or userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || "https://dohpass.com";

    const baseSession = {
      mode: "subscription" as const,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
    };

    const existingCustomerId = await lookupStripeCustomerId(userId);

    let session;
    if (existingCustomerId) {
      try {
        session = await stripe.checkout.sessions.create({
          ...baseSession,
          customer: existingCustomerId,
        });
      } catch (err) {
        if (!isStripeCustomerMissingError(err)) throw err;
        // Customer was deleted in Stripe (or belongs to a different mode/account).
        // Fall back to email flow; Stripe will create a fresh customer and the
        // webhook will overwrite stripe_customer_id on checkout.session.completed.
        console.warn(
          `create-checkout: stripe customer ${existingCustomerId} missing for user ${userId}; falling back to customer_email`,
        );
        session = await stripe.checkout.sessions.create({
          ...baseSession,
          customer_email: userEmail,
        });
      }
    } else {
      session = await stripe.checkout.sessions.create({
        ...baseSession,
        customer_email: userEmail,
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
