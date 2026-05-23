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

const SIGNATURE = `<p style="color:#666;font-size:13px;">— Dr. Ibrahim, DOHPass</p>`;

const TEMPLATES: Record<Day, Template> = {
  2: {
    subject: "5 questions. That's all.",
    html:
      `<p>You signed up for DOHPass but haven't started yet. That's normal — the exam feels far away.</p>` +
      `<p>Here's the thing: candidates who practice 5 questions a day for 60 days pass at a higher rate than those who cram for 2 weeks.</p>` +
      `<p>5 questions. Today. That's it.</p>` +
      `<p><a href="https://dohpass.com/dashboard" style="${BUTTON_STYLE}">Start now →</a></p>` +
      SIGNATURE,
  },
  5: {
    subject: "The exam doesn't wait",
    html:
      `<p>Every day you're not practicing, someone else is.</p>` +
      `<p>DOH pass rates are not kind to last-minute prep. The question bank is there. 5 minutes is enough to start.</p>` +
      `<p><a href="https://dohpass.com/dashboard" style="${BUTTON_STYLE}">Pick up where you left off →</a></p>` +
      SIGNATURE,
  },
  10: {
    subject: "What kind of doctor passes the DOH?",
    html:
      `<p>Not the smartest one. The most consistent one.</p>` +
      `<p>20 minutes a day. That's the difference between candidates who pass first attempt and those who sit it twice.</p>` +
      `<p>You built the habit of showing up every day in the hospital. This is the same thing.</p>` +
      `<p><a href="https://dohpass.com/dashboard" style="${BUTTON_STYLE}">Start your 20 minutes →</a></p>` +
      SIGNATURE,
  },
  14: {
    subject: "Should I close your account?",
    html:
      `<p>You haven't logged in since signing up. That's okay — timing matters.</p>` +
      `<p>I'm going to assume DOH prep isn't a priority right now and pause your access in 48 hours. If I'm wrong, just click below — I'll keep everything exactly as it is.</p>` +
      `<p><a href="https://dohpass.com/dashboard" style="${BUTTON_STYLE}">Keep my account active →</a></p>` +
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
      from: "DOHPass <support@dohpass.com>",
      to: [email],
      reply_to: "support@dohpass.com",
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
