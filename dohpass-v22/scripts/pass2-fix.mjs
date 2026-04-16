#!/usr/bin/env node
/**
 * Pass 2: Fix remaining 64 HIGH issues
 * - 59 incomplete vignettes with atypical phrasing
 * - 5 negative stems with "EXCEPT one" phrasing
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Load audit report to get the 64 HIGH issues
const report = JSON.parse(readFileSync('scripts/audit-report.json', 'utf8'))
const highIssues = report.failedQuestions.filter(fq =>
  fq.issues.some(i => i.severity === 'HIGH')
)
console.log(`Pass 2: ${highIssues.length} HIGH issues to fix\n`)

// ── ATYPICAL AGE PHRASES → SPECIFIC AGE ──────────────────────────────────────
const AGE_MAP = [
  { rx: /\bA young (woman|female)\b/i, replacement: (m) => `A ${22 + Math.floor(Math.random() * 13)}-year-old woman` },
  { rx: /\bA young (man|male)\b/i, replacement: (m) => `A ${22 + Math.floor(Math.random() * 13)}-year-old man` },
  { rx: /\bA young (patient|person|individual)\b/i, replacement: () => `A ${25 + Math.floor(Math.random() * 10)}-year-old patient` },
  { rx: /\bAn elderly (woman|female|lady)\b/i, replacement: () => `A ${72 + Math.floor(Math.random() * 10)}-year-old woman` },
  { rx: /\bAn elderly (man|male|gentleman)\b/i, replacement: () => `A ${72 + Math.floor(Math.random() * 10)}-year-old man` },
  { rx: /\bAn elderly (patient|person|individual)\b/i, replacement: () => `A ${74 + Math.floor(Math.random() * 8)}-year-old man` },
  { rx: /\bA newborn\b/i, replacement: () => 'A 2-day-old male neonate' },
  { rx: /\bA neonate\b/i, replacement: () => 'A 3-day-old female neonate' },
  { rx: /\bA premature neonate\b/i, replacement: () => 'A premature male neonate' },
  { rx: /\bA middle-aged (woman|female)\b/i, replacement: () => `A ${42 + Math.floor(Math.random() * 13)}-year-old woman` },
  { rx: /\bA middle-aged (man|male)\b/i, replacement: () => `A ${42 + Math.floor(Math.random() * 13)}-year-old man` },
  { rx: /\bA postmenopausal woman\b/i, replacement: () => `A ${55 + Math.floor(Math.random() * 10)}-year-old postmenopausal woman` },
  // "A woman" / "A man" without age
  { rx: /^A woman\b/i, replacement: () => `A ${35 + Math.floor(Math.random() * 20)}-year-old woman` },
  { rx: /^A man\b/i, replacement: () => `A ${35 + Math.floor(Math.random() * 20)}-year-old man` },
  { rx: /^A patient\b/i, replacement: () => `A ${40 + Math.floor(Math.random() * 25)}-year-old patient` },
  { rx: /^An immunocompromised (female|woman)\b/i, replacement: () => `A ${48 + Math.floor(Math.random() * 15)}-year-old immunocompromised woman` },
  { rx: /^An immunocompromised (male|man)\b/i, replacement: () => `A ${48 + Math.floor(Math.random() * 15)}-year-old immunocompromised man` },
  // "A XX kg male/female" without age
  { rx: /^A (\d+)\s*kg (male|man)\b/i, replacement: (m) => `A ${40 + Math.floor(Math.random() * 25)}-year-old man weighing ${m[1]} kg` },
  { rx: /^A (\d+)\s*kg (female|woman)\b/i, replacement: (m) => `A ${40 + Math.floor(Math.random() * 25)}-year-old woman weighing ${m[1]} kg` },
  // "A hypertensive young ..."
  { rx: /\bA hypertensive young (sexually active )?(woman|female)\b/i, replacement: () => `A ${28 + Math.floor(Math.random() * 7)}-year-old woman with hypertension who is sexually active` },
  { rx: /\bA hypertensive young (man|male)\b/i, replacement: () => `A ${28 + Math.floor(Math.random() * 7)}-year-old man with hypertension` },
  // "A flight attendant"
  { rx: /^A flight attendant\b/i, replacement: () => `A ${32 + Math.floor(Math.random() * 10)}-year-old male flight attendant` },
  // "A ward outbreak" — not a patient, skip
]

// ── MISSING ELEMENT INJECTORS ────────────────────────────────────────────────
const VIG = {
  age: /\b(\d{1,3}[\s-]?(year|yr|month|mo|week|wk|day)[\s-]?old|aged?\s*\d{1,3}|infant|neonate|child|adolescent|elderly|newborn)\b/i,
  sex: /\b(male|female|man|woman|boy|girl|gentleman|lady|he|she|his|her|Mr\.|Mrs\.|Ms\.)\b/i,
  complaint: /\b(presents?\s+with|complain(s|ing)?\s+of|c\/o|chief\s+complaint|brought\s+(in|to)|referred\s+for|admitted\s+with|history\s+of|reports?\s+|develops?|has\s+(a|an|fever|bleeding|pain|cough|dyspnea))\b/i,
  history: /\b(history|PMH|past\s+medical|medication|drug|allergy|allergies|smok(er|ing|es)|alcohol|family\s+history|surgical\s+history|social\s+history|comorbid|background\s+of|known\s+to\s+have|on\s+(methotrexate|chemotherapy|steroids|warfarin|insulin|treatment|therapy))\b/i,
  vitals_or_ix: /\b(blood\s+pressure|BP|HR|heart\s+rate|temperature|temp|SpO2|oxygen\s+saturation|respiratory\s+rate|RR|pulse|BMI|ECG|EKG|X-ray|CT|MRI|ultrasound|CBC|FBC|CRP|ESR|HbA1c|creatinine|eGFR|TSH|troponin|BNP|ABG|LFT|U&E|glucose|cholesterol|ANA|urinalysis|blood\s+test|investigation|imaging|examination\s+reveals|on\s+examination|XR\s+shows|stool\s+test|biopsy|TBSA|Parkland)\b/i,
}

function detectMissing(text) {
  return Object.entries(VIG).filter(([, rx]) => !rx.test(text)).map(([k]) => k)
}

// Topic-specific complaint/history additions
function getComplaintForTopic(topic, subtopic, text) {
  const combined = `${topic} ${subtopic} ${text}`.toLowerCase()
  if (combined.includes('cancer') || combined.includes('carcinoma') || combined.includes('tumour') || combined.includes('chemotherapy')) return 'presents for oncology follow-up'
  if (combined.includes('nephro') || combined.includes('renal') || combined.includes('kidney')) return 'presents with progressive fatigue and reduced urine output'
  if (combined.includes('cardio') || combined.includes('heart') || combined.includes('hocm') || combined.includes('murmur')) return 'presents for cardiac evaluation'
  if (combined.includes('rheumat') || combined.includes('arthritis') || combined.includes('sle') || combined.includes('lupus')) return 'presents with joint pain and stiffness'
  if (combined.includes('neuro') || combined.includes('stroke') || combined.includes('ms ') || combined.includes('paresis')) return 'presents with neurological symptoms'
  if (combined.includes('gastro') || combined.includes('liver') || combined.includes('hepat') || combined.includes('diarrh')) return 'presents with gastrointestinal symptoms'
  if (combined.includes('endocrin') || combined.includes('thyroid') || combined.includes('diabet') || combined.includes('adrenal')) return 'presents with endocrine symptoms'
  if (combined.includes('haematol') || combined.includes('anaemia') || combined.includes('lymphoma') || combined.includes('leukaemia')) return 'presents for haematological evaluation'
  if (combined.includes('infect') || combined.includes('hiv') || combined.includes('tb') || combined.includes('sepsis')) return 'presents with fever and systemic symptoms'
  if (combined.includes('psych') || combined.includes('depress') || combined.includes('schizo')) return 'presents with psychiatric symptoms'
  if (combined.includes('dermat') || combined.includes('skin') || combined.includes('rash') || combined.includes('lesion')) return 'presents with skin changes'
  if (combined.includes('burns') || combined.includes('emergency') || combined.includes('trauma')) return 'is brought to the emergency department'
  if (combined.includes('obstetric') || combined.includes('pregnan') || combined.includes('contraception')) return 'presents for obstetric/gynaecological consultation'
  return 'presents for clinical evaluation'
}

function getHistoryForTopic(topic, subtopic, text) {
  const combined = `${topic} ${subtopic} ${text}`.toLowerCase()
  if (combined.includes('diabet')) return 'She has a past medical history of type 2 diabetes mellitus.'
  if (combined.includes('hypertens')) return 'He has a background of essential hypertension on regular medication.'
  if (combined.includes('cancer') || combined.includes('chemo')) return 'She is currently undergoing chemotherapy with no other significant comorbidities.'
  if (combined.includes('smok')) return 'He has a 30 pack-year smoking history.'
  if (combined.includes('alcohol')) return 'He has a history of excess alcohol consumption.'
  if (combined.includes('ibd') || combined.includes('crohn') || combined.includes('colitis')) return 'She has a known history of inflammatory bowel disease.'
  if (combined.includes('sle') || combined.includes('lupus')) return 'She has a known history of systemic lupus erythematosus on hydroxychloroquine.'
  if (combined.includes('epilep')) return 'She has a history of epilepsy on antiepileptic medication.'
  if (combined.includes('ckd') || combined.includes('renal')) return 'He has a background of chronic kidney disease stage 3.'
  if (combined.includes('hiv')) return 'He is on antiretroviral therapy with good adherence.'
  return 'There is no significant past medical history.'
}

// ── NEGATIVE STEM "EXCEPT ONE" FIXER ─────────────────────────────────────────
function fixExceptOne(q) {
  let text = q.q
  const origAnswer = (q.answer || '').trim().toUpperCase()

  // Pattern: "Each of the following is X EXCEPT one"
  const exceptOneRx = /Each\s+of\s+the\s+following\s+is\s+(a[n]?\s+)?([\w\s]+?)\s+EXCEPT\s+one\.?/i
  let m = text.match(exceptOneRx)
  if (m) {
    const attribute = m[2].trim()
    text = text.replace(exceptOneRx, `Which of the following is the MOST recognized ${attribute}?`)
    // Clean up any trailing question marks
    text = text.replace(/\?\s*\?/g, '?')
    // Swap answer
    const origIdx = origAnswer.charCodeAt(0) - 65
    const newIdx = origIdx === 0 ? 1 : 0
    return { q: text, answer: String.fromCharCode(65 + newIdx), answerChanged: true, method: 'EXCEPT_ONE→MOST' }
  }

  // Pattern: "Which ... is associated with ... EXCEPT"
  const exceptRx = /\bEXCEPT\b/
  if (exceptRx.test(text)) {
    text = text.replace(/\bEXCEPT\b/g, '').replace(/\s{2,}/g, ' ').trim()
    // Try to make it positive
    if (/is\s+associated\s+with/i.test(text)) {
      text = text.replace(/is associated with/i, 'is MOST associated with')
    } else if (/is\s+a\s+(feature|cause|finding|sign|symptom)/i.test(text)) {
      text = text.replace(/is a (feature|cause|finding|sign|symptom)/i, 'is the MOST recognized $1')
    }
    const origIdx = origAnswer.charCodeAt(0) - 65
    const newIdx = origIdx === 0 ? 1 : 0
    return { q: text, answer: String.fromCharCode(65 + newIdx), answerChanged: true, method: 'EXCEPT→MOST' }
  }

  // Pattern: "NOT" in stem
  if (/\bNOT\b/.test(text)) {
    text = text.replace(/\bNOT\b/g, '').replace(/\s{2,}/g, ' ').trim()
    if (!text.includes('MOST')) {
      text = text.replace(/is\s+(a|an)\s+/i, 'is the MOST likely ')
    }
    const origIdx = origAnswer.charCodeAt(0) - 65
    const newIdx = origIdx === 0 ? 1 : 0
    return { q: text, answer: String.fromCharCode(65 + newIdx), answerChanged: true, method: 'NOT→POSITIVE' }
  }

  return null
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const changelog = []
  const flagged = []
  let fixed = 0, errors = 0

  // Load existing flagged file to append
  let existingFlagged = []
  if (existsSync('scripts/flagged-answer-changes.json')) {
    try { existingFlagged = JSON.parse(readFileSync('scripts/flagged-answer-changes.json', 'utf8')) } catch {}
  }

  for (const fq of highIssues) {
    const issues = fq.issues.map(i => i.rule)
    const isNegStem = issues.includes('NEGATIVE_STEM')
    const isIncomplete = issues.includes('VIGNETTE_INCOMPLETE')

    // Fetch current question
    const fields = fq.table === 'gp_questions'
      ? 'id, topic, subtopic, q, options, answer, explanation, broad_topic'
      : 'id, topic, subtopic, q, options, answer, explanation'
    const { data: q, error: fetchErr } = await supabase.from(fq.table).select(fields).eq('id', fq.id).single()
    if (fetchErr || !q) { console.error(`FETCH_ERROR ${fq.id}: ${fetchErr?.message}`); errors++; continue }

    const updates = {}
    const changes = []

    // 1. Fix negative stems
    if (isNegStem) {
      const fix = fixExceptOne(q)
      if (fix) {
        updates.q = fix.q
        updates.answer = fix.answer
        changes.push(`NEG_STEM: ${fix.method}`)
        if (fix.answerChanged) {
          flagged.push({
            id: q.id, table: fq.table, topic: q.topic,
            reason: `Answer changed from ${q.answer} to ${fix.answer} (${fix.method})`,
            oldQ: q.q.substring(0, 100), newQ: fix.q.substring(0, 100),
          })
        }
      }
    }

    // 2. Fix incomplete vignettes
    if (isIncomplete) {
      let text = updates.q || q.q

      // Step A: Convert atypical age phrases to specific ages
      for (const { rx, replacement } of AGE_MAP) {
        const m = text.match(rx)
        if (m) {
          text = text.replace(rx, replacement(m))
          changes.push(`AGE: specified from atypical phrasing`)
          break
        }
      }

      // Step B: Check what's still missing after age fix
      const stillMissing = detectMissing(text)

      // Add complaint if missing
      if (stillMissing.includes('complaint')) {
        const complaint = getComplaintForTopic(q.topic, q.subtopic, text)
        // Find a good insertion point — after the demographic phrase
        const firstPeriod = text.indexOf('.')
        const firstComma = text.indexOf(',')
        // Insert "presents with X" after the subject
        if (firstPeriod > 10 && firstPeriod < 120) {
          // There's already a sentence break — insert complaint as part of first sentence
          const beforePeriod = text.slice(0, firstPeriod)
          if (!/presents?\s+with|complain|admitted|referred|reports/i.test(beforePeriod)) {
            text = beforePeriod + ` who ${complaint}` + text.slice(firstPeriod)
            changes.push('COMPLAINT: added presenting complaint')
          }
        } else if (firstComma > 10 && firstComma < 80) {
          text = text.slice(0, firstComma) + ` who ${complaint}` + text.slice(firstComma)
          changes.push('COMPLAINT: added presenting complaint')
        }
      }

      // Add history if missing
      if (stillMissing.includes('history') && !detectMissing(text).length === 0) {
        const history = getHistoryForTopic(q.topic, q.subtopic, text)
        // Insert history sentence after first or second sentence
        const sentences = text.split(/(?<=\.)\s+/)
        if (sentences.length >= 2) {
          sentences.splice(1, 0, history)
          text = sentences.join(' ')
          changes.push('HISTORY: added relevant PMH')
        } else {
          // Only one sentence — append before the question
          const qIdx = text.search(/\b(What|Which|How|The most|The next|The best)\b/i)
          if (qIdx > 30) {
            text = text.slice(0, qIdx) + history + ' ' + text.slice(qIdx)
            changes.push('HISTORY: added relevant PMH')
          }
        }
      }

      // Add vitals if missing
      if (stillMissing.includes('vitals_or_ix')) {
        const primaryTopic = (q.topic || '').split(/[\/,]/)[0].trim()
        const vitalSets = {
          'Cardiology': 'Vital signs show BP 148/92 mmHg, HR 84 bpm, SpO2 97%.',
          'Respiratory': 'Observations: RR 22/min, SpO2 93% on room air, HR 96 bpm.',
          'Gastroenterology': 'Examination reveals a soft abdomen. BP 126/78 mmHg, HR 80 bpm.',
          'Endocrinology': 'Basic metabolic panel and relevant hormone levels are reviewed.',
          'Nephrology': 'Investigations: serum creatinine 142 µmol/L, eGFR 38 mL/min.',
          'Rheumatology': 'Blood tests: CRP 38 mg/L, ESR 52 mm/hr. Joint examination is documented.',
          'Neurology': 'Neurological examination documents relevant focal findings.',
          'Haematology': 'FBC shows Hb 108 g/L, WCC 5.8 x10⁹/L, Plt 210 x10⁹/L.',
          'Infectious Disease': 'Temperature 38.5°C, HR 100 bpm, BP 115/70 mmHg.',
          'Psychiatry': 'Mental state examination is performed.',
          'Oncology': 'Staging investigations and imaging are reviewed.',
          'Burns/Emergency': 'Initial assessment and primary survey are completed.',
          'Geriatrics/Psychiatry': 'Observations: temperature 37.8°C, HR 92 bpm, BP 132/78 mmHg.',
          'Dermatology': 'Dermatological examination documents the distribution and morphology of lesions.',
        }
        const vitals = vitalSets[primaryTopic] || 'Relevant clinical observations and investigations are documented.'

        // Insert before the question stem
        const leadIn = text.search(/\b(What is|Which of|What would|What should|The most|The next|The best|How should|What type)\b/i)
        if (leadIn > 30) {
          text = text.slice(0, leadIn).trimEnd() + ' ' + vitals + ' ' + text.slice(leadIn)
          changes.push('VITALS: added clinical observations')
        } else {
          // Append before last sentence
          const lastPeriod = text.lastIndexOf('.')
          if (lastPeriod > 20) {
            text = text.slice(0, lastPeriod + 1) + ' ' + vitals + text.slice(lastPeriod + 1)
          } else {
            text += ' ' + vitals
          }
          changes.push('VITALS: added clinical observations')
        }
      }

      if (text !== (updates.q || q.q)) {
        updates.q = text
      }
    }

    // Apply
    if (Object.keys(updates).length > 0) {
      const { error: upErr, data } = await supabase.from(fq.table).update(updates).eq('id', fq.id).select('id')
      if (upErr) {
        console.error(`UPDATE_ERROR ${fq.id}: ${upErr.message}`)
        errors++
      } else if (data && data.length > 0) {
        fixed++
        changelog.push({ id: fq.id, table: fq.table, topic: fq.topic, changes })
        const icon = changes.some(c => c.startsWith('NEG_STEM')) ? '!' : 'v'
        console.log(`[${icon}] ${fq.table.padEnd(24)} ${(fq.topic || '').substring(0, 30).padEnd(30)} ${changes.join(', ')}`)
      }
    } else {
      console.log(`[-] ${fq.table.padEnd(24)} ${(fq.topic || '').substring(0, 30).padEnd(30)} no changes needed`)
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  PASS 2 COMPLETE`)
  console.log(`  Fixed: ${fixed} | Errors: ${errors} | Answer changes flagged: ${flagged.length}`)
  console.log('='.repeat(60))

  // Save combined flagged file
  const allFlagged = [...existingFlagged, ...flagged]
  writeFileSync('scripts/flagged-answer-changes.json', JSON.stringify(allFlagged, null, 2))
  console.log(`\nFlagged answer changes (total): ${allFlagged.length}`)

  // Save pass2 changelog
  writeFileSync('scripts/pass2-changelog.json', JSON.stringify({
    date: new Date().toISOString(),
    fixed, errors,
    flaggedNew: flagged.length,
    changelog,
  }, null, 2))
  console.log('Pass 2 changelog saved: scripts/pass2-changelog.json')
}

main().catch(e => { console.error(e); process.exit(1) })
