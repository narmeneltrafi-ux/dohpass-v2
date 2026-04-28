import Stripe from "https://esm.sh/stripe@17.7.0?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno&no-check";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://dohpass.com")
  .split(",").map(s => s.trim()).filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

// Same in-function JWT verification pattern as create-checkout: the Edge
// gateway rejects both ES256 (UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM) and
// HS256 (UNAUTHORIZED_LEGACY_JWT) on this project, so verify via GoTrue
// directly. Remove this workaround once the Supabase support ticket is
// resolved and gateway verification accepts our tokens.
async function verifyCallerAndGetUserId(
  req: Request,
): Promise<{ userId: string } | Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SB_SERVICE_ROLE_KEY) {
    console.error("create-portal-session: missing SUPABASE_URL or SB_SERVICE_ROLE_KEY env");
    return new Response(
      JSON.stringify({ error: "Auth misconfigured" }),
      { status: 500, headers: { ...corsFor(req), "Content-Type": "application/json" } },
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsFor(req), "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired session" }),
      { status: 401, headers: { ...corsFor(req), "Content-Type": "application/json" } },
    );
  }

  return { userId: data.user.id };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsFor(req) });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsFor(req), "Content-Type": "application/json" },
      });
    }

    // AUTH — must succeed before touching Stripe.
    const auth = await verifyCallerAndGetUserId(req);
    if (auth instanceof Response) return auth;
    const { userId } = auth;

    const stripeCustomerId = await lookupStripeCustomerId(userId);
    if (!stripeCustomerId) {
      return new Response(
        JSON.stringify({ error: "No active subscription" }),
        { status: 404, headers: { ...corsFor(req), "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
    const reqOrigin = req.headers.get("origin") ?? "";
    const safeOrigin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${safeOrigin}/account`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-portal-session error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  }
});
