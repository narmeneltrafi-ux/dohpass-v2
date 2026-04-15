# DOHPass — Project Status

**Last updated:** 2026-04-15
**Purpose:** UAE medical licensing exam prep — Specialist and GP tracks
**Repo path:** `/home/dohpass/dohpass-v2/dohpass-v22/`

---

## Live Features

| Feature | Status |
|---|---|
| Specialist quiz track | Live |
| GP quiz track | Live |
| Topic / subtopic filtering | Live |
| GP broad-topic (system) filtering | Live |
| Auth — email/password via Supabase | Live |
| Flashcard system | Live |
| Results screen | Live |

---

## Pending Work

| Feature | Notes |
|---|---|
| Stripe paywall | `profiles.is_paid` + `getUserPlan()` ready; payment flow not built |
| Progress tracking UI | `user_progress` table + backend functions exist; not wired to UI |
| Bare domain DNS | `dohpass.com` A record → `216.198.79.1` still pending |

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/supabase.js` | All DB queries, auth, progress, plan helpers |
| `src/pages/SpecialistQuiz.jsx` | Specialist exam flow |
| `src/pages/GPQuiz.jsx` | GP exam flow |
| `src/pages/FlashcardSystem.jsx` | Flashcard session logic |
| `src/pages/FlashcardsHome.jsx` | Flashcard track selector |
| `src/pages/FlashcardsTrack.jsx` | Flashcard topic/track page |
| `src/pages/Home.jsx` | Landing / track selector |
| `src/pages/AuthPage.jsx` | Login / signup |
| `src/components/QuestionCard.jsx` | Core question render component |
| `src/components/ResultsScreen.jsx` | End-of-quiz results |
| `CLAUDE.md` | Project context (authoritative source) |
| `vercel.json` | SPA rewrite rule |
| `vite.config.js` | Build config |

---

## Database Quick Reference

| Table | Purpose |
|---|---|
| `specialist_questions` | Specialist track questions |
| `gp_questions` | GP track questions (adds `broad_topic`) |
| `user_progress` | Per-user answer history, upsert on `(user_id, question_id)` |
| `profiles` | User plan status (`is_paid` boolean) |

Supabase project: `qvzvdwvyihwwiqlhgogq`

---

## Tech Stack

| | |
|---|---|
| Framework | React 18 + Vite 5 |
| Routing | React Router v6 |
| Database | Supabase JS v2 |
| Hosting | Vercel (`dohpass-v2-pthr`) |
| Styling | Custom CSS — `src/index.css`, no framework |
