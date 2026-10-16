// send-reengagement-email — sends a day-specific re-engagement email via Resend.
// Invoked by pg_cron through public.trigger_reengagement_emails() for users who
// confirmed their email N days ago and still have no rows in user_progress.

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

type Day = 2 | 5 | 10 | 14;

interface Template {
  subject: string;
  html: string;
}

const BUTTON_STYLE =
  "background:#C9A227;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;";

const SIGNATURE =
  `<p style="color:#666;font-size:13px;">— Dr. Huzaifa Ibrahim<br>` +
  `Internal Medicine Specialist (DOH) · Founder, DOHPass</p>` +
  `<p style="color:#999;font-size:12px;">Rather not get these? Reply "stop" and I'll take you off the list.</p>`;

// Links carry UTM tags so returns from each email are visible in the funnel.
const link = (day: Day) =>
  `https://www.dohpass.com/dashboard?utm_source=email&utm_medium=reengagement&utm_campaign=day${day}`;

// Copy rules (DOHPass master prompt §3C, §5E/F): no invented statistics, no
// fear or shame, no fake deadlines. Every claim must be true of the product.
const TEMPLATES: Record<Day, Template> = {
  2: {
    subject: "Your 10 free DOH questions are ready",
    html:
      `<p>You signed up for DOHPass a couple of days ago but haven't answered a question yet.</p>` +
      `<p>Your first 10 questions are free. Pick your exam — GP or Internal Medicine Specialist — and you get a full explanation after each answer: why the right one is right, and why the others aren't.</p>` +
      `<p><a href="${link(2)}" style="${BUTTON_STYLE}">Answer my first question →</a></p>` +
      SIGNATURE,
  },
  5: {
    subject: "One question, two minutes",
    html:
      `<p>If 10 questions feels like a lot right now, start with one.</p>` +
      `<p>It's a single clinical vignette with one best answer, followed by the explanation. You'll know quickly whether the format suits how you study.</p>` +
      `<p><a href="${link(5)}" style="${BUTTON_STYLE}">Try one question →</a></p>` +
      SIGNATURE,
  },
  10: {
    subject: "How I'd use DOHPass if I were starting today",
    html:
      `<p>I passed the DOH Internal Medicine Specialist exam this year. If I were starting prep again, I'd do this:</p>` +
      `<p>1. Answer a short block of questions.<br>` +
      `2. Read every explanation, including the ones you got right.<br>` +
      `3. Go back to the topics you missed before moving on.</p>` +
      `<p>Your 10 free questions are still there — enough to see where you stand.</p>` +
      `<p><a href="${link(10)}" style="${BUTTON_STYLE}">Start a short block →</a></p>` +
      SIGNATURE,
  },
  14: {
    subject: "Last email from me",
    html:
      `<p>This is the last reminder I'll send.</p>` +
      `<p>Your account stays open and your 10 free questions don't expire — they'll be there whenever your exam gets closer.</p>` +
      `<p>Good luck with your prep.</p>` +
      `<p><a href="${link(14)}" style="${BUTTON_STYLE}">Open DOHPass →</a></p>` +
      SIGNATURE,
  },
};

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

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

  let payload: { email?: unknown; day?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const day = typeof payload.day === "number" ? payload.day : Number(payload.day);

  if (!email || !email.includes("@")) {
    return json({ error: "Missing or invalid email" }, 400);
  }

  const template = TEMPLATES[day as Day];
  if (!template) {
    return json({ error: `Unsupported day: ${payload.day}` }, 400);
  }

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Dr. Huzaifa Ibrahim / DOHPass <hello@dohpass.com>",
      to: [email],
      reply_to: "hello@dohpass.com",
      subject: template.subject,
      html: template.html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error(`Resend send failed day=${day} status=${resendRes.status}: ${errText}`);
    return json({ error: "Resend send failed", status: resendRes.status }, 502);
  }

  const result = (await resendRes.json()) as { id?: string };
  console.log(`Sent day=${day} resend_id=${result.id ?? "unknown"}`);
  return json({ ok: true, id: result.id ?? null }, 200);
});
