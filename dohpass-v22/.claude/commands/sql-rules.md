# DOHPass — SQL Rules

Rules for all INSERT statements targeting `specialist_questions` and `gp_questions`.

---

## Escaping

- Escape single quotes as **double single quotes**: `it''s` not `it\'s`
- Never use backslash escaping

---

## Options Array

```sql
options = ARRAY['Option text one','Option text two','Option text three','Option text four']
```

- No A / B / C / D labels inside option text — the UI renders letters automatically
- 4 options minimum, 5 maximum
- Plain strings, no trailing period unless the stem ends mid-sentence

---

## Answer Field

- Single uppercase letter only: `A`, `B`, `C`, `D`, or `E`
- Must correspond to the correct index in the `options` array (A = index 0)

---

## Question Stem (`q`)

- Full Pearson VUE clinical vignette format
- Pattern: patient demographics → presenting complaint → relevant history → examination findings → investigation results → single best answer question
- No negative stems ("which of the following is NOT…")
- No give-away language

---

## Explanation Field

- Must include guideline citations (NICE, BTS, ESC, SIGN, DHA, MOH, etc.)
- Explain why the correct answer is right
- Address the closest distractor(s)

---

## `specialist_questions` boilerplate

```sql
INSERT INTO specialist_questions
  (topic, subtopic, q, options, answer, explanation, difficulty, source, is_active)
VALUES
  (
    'Cardiology',
    'Heart Failure',
    'A 68-year-old man with a 3-month history of exertional dyspnoea…',
    ARRAY[
      'Furosemide 40 mg OD',
      'Spironolactone 25 mg OD',
      'Bisoprolol 1.25 mg OD',
      'Ramipril 2.5 mg OD'
    ],
    'D',
    'NICE NG106 recommends ACE inhibitor (ramipril) as first-line in HFrEF. Beta-blockers are added once euvolaemic. Mineralocorticoid antagonists are third-line. Loop diuretics treat symptoms but do not improve mortality.',
    'medium',
    'NICE NG106',
    true
  );
```

---

## `gp_questions` boilerplate

Add `broad_topic` as the first column/value:

```sql
INSERT INTO gp_questions
  (broad_topic, topic, subtopic, q, options, answer, explanation, difficulty, source, is_active)
VALUES
  (
    'Cardiology',
    'Heart Failure',
    'Acute decompensation',
    'A 72-year-old woman presents to her GP with…',
    ARRAY[
      'Option A',
      'Option B',
      'Option C',
      'Option D'
    ],
    'B',
    'Guideline-cited explanation…',
    'medium',
    'NICE NG106',
    true
  );
```

---

## Batch inserts

Extend `VALUES` with additional tuples — do not use separate `INSERT` statements for bulk loads:

```sql
INSERT INTO specialist_questions
  (topic, subtopic, q, options, answer, explanation, difficulty, source, is_active)
VALUES
  ('Topic1', 'Sub1', 'Stem 1…', ARRAY['A','B','C','D'], 'A', 'Explanation 1…', 'easy',   'NICE X', true),
  ('Topic2', 'Sub2', 'Stem 2…', ARRAY['A','B','C','D'], 'C', 'Explanation 2…', 'medium', 'NICE Y', true),
  ('Topic3', 'Sub3', 'Stem 3…', ARRAY['A','B','C','D'], 'B', 'Explanation 3…', 'hard',   'NICE Z', true);
```
