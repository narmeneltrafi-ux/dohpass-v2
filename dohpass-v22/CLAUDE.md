# DOHPass v2 — Project Context

## Overview

| Field | Value |
|---|---|
| Stack | React + Vite + Supabase |
| Repo | narmeneltrafi-ux/dohpass-v2 |
| Vercel project | dohpass-v2-pthr |
| Supabase project ID | qvzvdwvyihwwiqlhgogq |

## Database Schema

### `specialist_questions`

| Column | Type |
|---|---|
| id | uuid |
| topic | text |
| subtopic | text |
| q | text |
| options | text[] ARRAY |
| answer | text (single uppercase letter) |
| explanation | text |
| difficulty | text |
| source | text |
| is_active | boolean |
| created_at | timestamptz |

### `gp_questions`

Same schema as `specialist_questions`, plus:

| Column | Type |
|---|---|
| broad_topic | text |

## SQL Rules

- Escape single quotes as double single quotes (`''`)
- Options format: `ARRAY['text','text']`
- No A/B/C labels inside option text
- `answer` is a single uppercase letter A–E
- Always include `explanation` with guideline citations

## Question Style

- Full Pearson VUE clinical vignette format
- Single best answer
- 3–5 distractors
- No negative stems

## Pending Work

- [ ] Paywall with Stripe
- [ ] Progress tracking
- [ ] Bare domain fix: `dohpass.com` A record → `216.198.79.1`
