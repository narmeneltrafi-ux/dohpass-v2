# DOHPass — Database Schema & SQL Rules

**Supabase Project ID:** `qvzvdwvyihwwiqlhgogq`
**Supabase Client:** `src/lib/supabase.js` — paginated via `fetchAllRows()` (1000-row pages)

---

## Tables

### `specialist_questions`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| topic | text | Primary topic (may contain `/` or `,` for sub-routing) |
| subtopic | text | Narrower classification |
| q | text | Full question stem (clinical vignette) |
| options | text[] ARRAY | 4–5 options, no A/B/C prefix inside text |
| answer | text | Single uppercase letter: A, B, C, D, or E |
| explanation | text | Guideline-cited rationale |
| difficulty | text | `easy`, `medium`, or `hard` |
| source | text | Guideline / reference source |
| is_active | boolean | Whether question is live |
| created_at | timestamptz | Auto-set |

### `gp_questions`

Identical to `specialist_questions`, plus:

| Column | Type | Notes |
|---|---|---|
| broad_topic | text | System-level grouping (e.g. `Cardiology`, `Psychiatry`) |

### `user_progress`

| Column | Type | Notes |
|---|---|---|
| user_id | uuid | FK → auth.users |
| track | text | `'specialist'` or `'gp'` |
| question_id | uuid | FK → question table |
| is_correct | boolean | Last attempt result |

Upsert conflict key: `(user_id, question_id)`

### `profiles`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK = auth.uid() |
| is_paid | boolean | `default false` — Stripe paywall flag |

---

## SQL Insert Rules

### Escaping
- Escape single quotes as **double single quotes**: `it''s` not `it\'s`
- Never use backslash escaping

### Options Array
```sql
options = ARRAY['Option text one','Option text two','Option text three','Option text four']
```
- No A / B / C / D labels inside option text — the UI renders letters automatically
- 4 options minimum, 5 maximum

### Answer Field
- Single uppercase letter only: `A`, `B`, `C`, `D`, or `E`
- Must correspond to the correct index in the `options` array (A = index 0)

### Question Stem (`q`)
- Full Pearson VUE clinical vignette format
- Pattern: demographics → complaint → history → examination → investigations → question
- No negative stems ("which is NOT…")

### Explanation
- Must cite guidelines (NICE, BTS, ESC, SIGN, etc.)
- Explain why the correct answer is right and why key distractors are wrong

---

## Boilerplate INSERT — `specialist_questions`

```sql
INSERT INTO specialist_questions
  (topic, subtopic, q, options, answer, explanation, difficulty, source, is_active)
VALUES
  (
    'Cardiology',
    'Heart Failure',
    'A 68-year-old man presents with…',
    ARRAY[
      'Furosemide 40 mg OD',
      'Spironolactone 25 mg OD',
      'Bisoprolol 1.25 mg OD',
      'Ramipril 2.5 mg OD'
    ],
    'D',
    'NICE NG106 recommends ACE inhibitor first-line in HFrEF…',
    'medium',
    'NICE NG106',
    true
  );
```

## Boilerplate INSERT — `gp_questions`

```sql
INSERT INTO gp_questions
  (broad_topic, topic, subtopic, q, options, answer, explanation, difficulty, source, is_active)
VALUES
  (
    'Cardiology',
    'Heart Failure',
    'Acute decompensation',
    'A 72-year-old woman presents with…',
    ARRAY['Option A','Option B','Option C','Option D'],
    'B',
    'Explanation with guideline citation…',
    'medium',
    'NICE NG106',
    true
  );
```

## Batch Inserts

```sql
INSERT INTO specialist_questions (topic, subtopic, q, options, answer, explanation, difficulty, source, is_active)
VALUES
  ('Topic1', 'Sub1', 'Q1…', ARRAY['A','B','C','D'], 'A', 'Explanation…', 'easy', 'Source', true),
  ('Topic2', 'Sub2', 'Q2…', ARRAY['A','B','C','D'], 'C', 'Explanation…', 'hard', 'Source', true);
```

---

## Topic Routing

`primaryTopic(topic)` in `src/lib/supabase.js` splits on `/` or `,` and takes the first segment. A topic stored as `Cardiology/Heart Failure` resolves to `Cardiology` for filtering. Always use the primary segment when filtering by topic.
