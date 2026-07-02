// notify-manual-order — sends a single alert email when a new manual
// bank-transfer order is placed. Invoked by pg_cron-style trigger
// public.notify_manual_order() via net.http_post on INSERT into
// public.manual_orders. Scope is deliberately narrow: one email per new
// order to the support inbox so a placed order never sits unseen. This is
// NOT a dashboard and does not activate access — an admin still runs the
// grant after confirming the transfer.

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const NOTIFY_TO = "support@dohpass.com";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // Auth: shared secret, same mechanism as the other cron-invoked functions.
  // Gateway verify_jwt stays false (this project's gateway rejects the HS256
  // service-role tokens pg_net would send).
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  if (!CRON_SECRET) {
    return json({ error: "Server misconfigured: CRON_SECRET unset" }, 500);
  }
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!constantTimeEqual(CRON_SECRET, providedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!RESEND_API_KEY) {
    return json({ error: "Server misconfigured: RESEND_API_KEY unset" }, 500);
  }

  let payload: {
    reference?: unknown;
    amountAed?: unknown;
    email?: unknown;
    createdAt?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const reference = typeof payload.reference === "string" ? payload.reference : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const amountAed =
    typeof payload.amountAed === "number" ? payload.amountAed : Number(payload.amountAed);
  const createdAt = typeof payload.createdAt === "string" ? payload.createdAt : "";

  if (!reference || !email) {
    return json({ error: "Missing reference or email" }, 400);
  }

  const amountLabel = Number.isFinite(amountAed) ? `${amountAed} AED` : "unknown amount";
  const html =
    `<p>A new manual bank-transfer order was just placed.</p>` +
    `<table style="border-collapse:collapse;font-size:14px;">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:600;">${reference}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">Amount</td><td style="padding:4px 0;font-weight:600;">${amountLabel}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">Customer</td><td style="padding:4px 0;">${email}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">Placed</td><td style="padding:4px 0;">${createdAt || "just now"}</td></tr>` +
    `</table>` +
    `<p style="color:#666;font-size:13px;">Match the reference against the incoming transfer, then run the access grant. Order stays <strong>pending</strong> until you do.</p>`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "DOHPass Orders <support@dohpass.com>",
      to: [NOTIFY_TO],
      reply_to: email,
      subject: `New order ${reference} — ${amountLabel}`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error(`Resend send failed ref=${reference} status=${resendRes.status}: ${errText}`);
    return json({ error: "Resend send failed", status: resendRes.status }, 502);
  }

  const result = (await resendRes.json()) as { id?: string };
  console.log(`Sent order alert ref=${reference} resend_id=${result.id ?? "unknown"}`);
  return json({ ok: true, id: result.id ?? null }, 200);
});
