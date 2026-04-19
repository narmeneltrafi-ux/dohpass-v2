import Stripe from "https://esm.sh/stripe@17.7.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno&no-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Returns a Response for 401/403, or a verified user id for success.
// Why this function exists: the Edge Functions gateway on this project
// rejects both ES256 (UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM) and HS256
// (UNAUTHORIZED_LEGACY_JWT) tokens, so the function runs with
// verify_jwt=false and performs auth in-process via GoTrue instead.
async function verifyCallerAndGetUserId(
  req: Request,
  bodyUserId: string | undefined,
): Promise<{ userId: string; email: string | null } | Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SB_SERVICE_ROLE_KEY) {
    console.error("create-checkout: missing SUPABASE_URL or SB_SERVICE_ROLE_KEY env");
    return new Response(
      JSON.stringify({ error: "Auth misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // supabase.auth.getUser(token) calls GET /auth/v1/user with the provided
  // token as the bearer credential. GoTrue verifies the signature server-side
  // against the current signing key (unaffected by the Edge gateway's
  // algorithm policy). No user or any error → unauthenticated.
  const admin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired session" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Trust the JWT over the request body. Prior behavior used bodyUserId
  // directly, which allowed an authenticated caller to attribute a checkout
  // to any user id. Now: if body supplies a userId, it must match the
  // verified user; otherwise ignore the body and use the verified id.
  if (bodyUserId && bodyUserId !== data.user.id) {
    console.warn(
      `create-checkout: body userId=${bodyUserId} does not match JWT sub=${data.user.id}`,
    );
    return new Response(
      JSON.stringify({ error: "userId does not match authenticated user" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return { userId: data.user.id, email: data.user.email ?? null };
}

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

    const { priceId, userId: bodyUserId, userEmail: bodyEmail } = await req.json();

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Missing priceId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AUTH — must succeed before any Stripe interaction.
    const auth = await verifyCallerAndGetUserId(req, bodyUserId);
    if (auth instanceof Response) return auth;
    const { userId, email: verifiedEmail } = auth;
    const customerEmail = verifiedEmail ?? bodyEmail;

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
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
        console.warn(
          `create-checkout: stripe customer ${existingCustomerId} missing for user ${userId}; falling back to customer_email`,
        );
        session = await stripe.checkout.sessions.create({
          ...baseSession,
          customer_email: customerEmail,
        });
      }
    } else {
      session = await stripe.checkout.sessions.create({
        ...baseSession,
        customer_email: customerEmail,
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
