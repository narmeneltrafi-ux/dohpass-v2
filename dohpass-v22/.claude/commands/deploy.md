# DOHPass — Deployment

## Stack

| Layer | Service | Detail |
|---|---|---|
| Frontend | Vercel | Project: `dohpass-v2-pthr` |
| Database + Auth | Supabase | Project ID: `qvzvdwvyihwwiqlhgogq` |
| Repo | GitHub | `narmeneltrafi-ux/dohpass-v2` |

---

## Environment Variables

Set in Vercel dashboard → Project Settings → Environment Variables.
Also required in `.env.local` for local dev.

| Variable | Where to find |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |

---

## Local Dev

```bash
cd /home/dohpass/dohpass-v2/dohpass-v22
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

---

## Deploy to Production

Push to `main` — Vercel auto-deploys via GitHub integration.

```bash
git add .
git commit -m "your message"
git push origin main
```

Vite builds to `dist/`. SPA routing handled by `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Supabase Edge Functions

Functions live in `supabase/functions/`. Deploy individually:

```bash
supabase functions deploy <function-name> --project-ref qvzvdwvyihwwiqlhgogq
```

---

## DNS / Domain

| Record | Status |
|---|---|
| `www.dohpass.com` | Live — Vercel CNAME |
| `dohpass.com` (bare) | **Pending** — A record needs to point to `216.198.79.1` |

---

## Pending Features (not yet deployed)

- **Stripe paywall** — `profiles.is_paid` column + `getUserPlan()` exist; payment UI not built
- **Progress tracking UI** — `user_progress` table + `saveProgress`/`fetchProgress` exist; not surfaced in frontend
