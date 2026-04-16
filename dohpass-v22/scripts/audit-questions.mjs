#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const VIGNETTE = {
  age: /\b(\d{1,3}[\s-]?(year|yr|month|mo|week|wk|day)[\s-]?old|aged?\s*\d{1,3}|infant|neonate|child|adolescent|elderly|newborn)\b/i,
  sex: /\b(male|female|man|woman|boy|girl|gentleman|lady|he|she|his|her|Mr\.|Mrs\.|Ms\.)\b/i,
  complaint: /\b(presents?\s+with|complain(s|ing)?\s+of|c\/o|chief\s+complaint|brought\s+(in|to)|referred\s+for|admitted\s+with|history\s+of|reports?\s+)\b/i,
  history: /\b(history|PMH|past\s+medical|medication|drug|allergy|allergies|smok(er|ing|es)|alcohol|family\s+history|surgical\s+history|social\s+history|comorbid)\b/i,
  vitals_or_ix: /\b(blood\s+pressure|BP|HR|heart\s+rate|temperature|temp|SpO2|oxygen\s+saturation|respiratory\s+rate|RR|pulse|BMI|ECG|EKG|X-ray|CT|MRI|ultrasound|CBC|FBC|CRP|ESR|HbA1c|creatinine|eGFR|TSH|troponin|BNP|ABG|LFT|U&E|glucose|cholesterol|ANA|urinalysis|blood\s+test|investigation|imaging)\b/i,
}
const NEG_STEMS = /\b(which\s+of\s+the\s+following\s+is\s+NOT|EXCEPT|LEAST\s+likely|all\s+of\s+the\s+following\s+EXCEPT|which\s+is\s+FALSE|which\s+is\s+INCORRECT|none\s+of\s+the\s+above)\b/i
const ALL_ABOVE = /\b(all\s+of\s+the\s+above|none\s+of\s+the\s+above)\b/i
const VALID_ANS = new Set(['A','B','C','D','E'])
const GUIDELINES = /\b(NICE|ESC|AHA|ACC|BTS|SIGN|EULAR|ADA|WHO|KDIGO|EASL|ACR|GOLD|GINA|EAU|ESMO|BSG|guideline|recommendation|evidence[\s-]based)\b/i

function audit(q, table) {
  const issues = []
  const text = q.q || ''
  const opts = (q.options || []).map(o => o || '')
  const ans = (q.answer || '').trim().toUpperCase()
  const expl = q.explanation || ''

  // Vignette quality
  const missing = Object.entries(VIGNETTE).filter(([,rx]) => !rx.test(text)).map(([k]) => k)
  const critMissing = missing.filter(m => ['age','sex','complaint'].includes(m))
  if (critMissing.length >= 2) issues.push({ rule: 'VIGNETTE_INCOMPLETE', severity: 'HIGH', detail: `Missing: ${missing.join(', ')}`, missing })
  else if (missing.length >= 3) issues.push({ rule: 'VIGNETTE_WEAK', severity: 'MEDIUM', detail: `Missing: ${missing.join(', ')}`, missing })

  // Answer validity
  if (!VALID_ANS.has(ans)) issues.push({ rule: 'INVALID_ANSWER', severity: 'CRITICAL', detail: `Answer "${q.answer}" not A-E` })
  if (ans && opts.length > 0 && (ans.charCodeAt(0) - 65) >= opts.length) issues.push({ rule: 'ANSWER_OUT_OF_RANGE', severity: 'CRITICAL', detail: `Answer "${ans}" but only ${opts.length} options` })

  // Options
  if (opts.length < 4) issues.push({ rule: 'TOO_FEW_OPTIONS', severity: 'HIGH', detail: `Only ${opts.length} options` })
  if (opts.length > 5) issues.push({ rule: 'TOO_MANY_OPTIONS', severity: 'MEDIUM', detail: `${opts.length} options` })
  if (opts.some(o => /^[A-E][\.\)\:]/.test(o.trim()))) issues.push({ rule: 'OPTION_HAS_LABEL', severity: 'HIGH', detail: 'Options contain A/B/C labels' })
  if (new Set(opts.map(o => o.trim().toLowerCase())).size < opts.length) issues.push({ rule: 'DUPLICATE_OPTIONS', severity: 'CRITICAL', detail: 'Duplicate options' })
  if (opts.some(o => ALL_ABOVE.test(o))) issues.push({ rule: 'ALL_NONE_ABOVE', severity: 'HIGH', detail: 'Contains all/none of the above' })

  // Stem
  if (NEG_STEMS.test(text)) issues.push({ rule: 'NEGATIVE_STEM', severity: 'HIGH', detail: 'Negative stem (NOT/EXCEPT/LEAST likely)' })

  // Explanation
  if (!expl || expl.trim().length < 20) issues.push({ rule: 'MISSING_EXPLANATION', severity: 'HIGH', detail: 'Explanation missing/too short' })
  if (expl && !GUIDELINES.test(expl)) issues.push({ rule: 'NO_GUIDELINE_CITATION', severity: 'MEDIUM', detail: 'No guideline citation in explanation' })

  // Vignette length
  if (text.split(/[.!?]+/).filter(s => s.trim().length > 5).length < 2) issues.push({ rule: 'VIGNETTE_TOO_SHORT', severity: 'MEDIUM', detail: 'Too short for Pearson VUE format' })

  // GP broad_topic
  if (table === 'gp_questions' && !q.broad_topic) issues.push({ rule: 'MISSING_BROAD_TOPIC', severity: 'MEDIUM', detail: 'Missing broad_topic' })

  return { id: q.id, topic: q.topic, subtopic: q.subtopic, table, preview: text.substring(0, 100), issues, pass: issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length === 0 }
}

async function fetchAll(table, fields) {
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(fields).range(from, from + 999)
    if (error) { console.error(`Error ${table}:`, error.message); break }
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function main() {
  console.log('DOHPass Question Audit\n')
  const results = []

  for (const table of ['specialist_questions', 'gp_questions']) {
    const fields = table === 'gp_questions'
      ? 'id, topic, subtopic, q, options, answer, explanation, broad_topic'
      : 'id, topic, subtopic, q, options, answer, explanation'
    console.log(`Fetching ${table}...`)
    const qs = await fetchAll(table, fields)
    console.log(`  ${qs.length} questions`)
    for (const q of qs) results.push(audit(q, table))
  }

  const crit = results.filter(r => r.issues.some(i => i.severity === 'CRITICAL'))
  const high = results.filter(r => r.issues.some(i => i.severity === 'HIGH') && !crit.includes(r))
  const med = results.filter(r => r.issues.some(i => i.severity === 'MEDIUM') && !crit.includes(r) && !high.includes(r))
  const passed = results.filter(r => r.pass)

  console.log('\n' + '='.repeat(70))
  console.log(`  Total: ${results.length} | PASS: ${passed.length} (${(passed.length/results.length*100).toFixed(1)}%) | CRITICAL: ${crit.length} | HIGH: ${high.length} | MEDIUM: ${med.length}`)
  console.log('='.repeat(70))

  const counts = {}
  for (const r of results) for (const i of r.issues) counts[i.rule] = (counts[i.rule] || 0) + 1
  console.log('\n  Issue breakdown:')
  for (const [rule, n] of Object.entries(counts).sort((a,b) => b[1]-a[1])) console.log(`    ${rule.padEnd(28)} ${n}`)

  // Show first 30 critical/high
  const bad = [...crit, ...high].slice(0, 30)
  if (bad.length) {
    console.log('\n' + '-'.repeat(70))
    console.log('  TOP CRITICAL/HIGH ISSUES:')
    for (const r of bad) {
      console.log(`\n  [${r.table}] ${r.id}`)
      console.log(`  ${r.topic} | ${r.preview}`)
      for (const i of r.issues.filter(i => ['CRITICAL','HIGH'].includes(i.severity))) console.log(`    !! ${i.rule}: ${i.detail}`)
    }
  }

  const failed = results.filter(r => !r.pass)
  const reportPath = 'scripts/audit-report.json'
  writeFileSync(reportPath, JSON.stringify({ date: new Date().toISOString(), summary: { total: results.length, passed: passed.length, critical: crit.length, high: high.length, medium: med.length }, failedQuestions: failed.map(r => ({ id: r.id, table: r.table, topic: r.topic, subtopic: r.subtopic, issues: r.issues })) }, null, 2))
  console.log(`\nReport saved: ${reportPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
