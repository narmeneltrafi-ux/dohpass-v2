#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const SKIP = args.includes('--skip') ? parseInt(args[args.indexOf('--skip') + 1]) : 0

function fixOptionLabels(opts) { return opts.map(o => (o || '').replace(/^[A-E][\.\)\:\s]+\s*/, '').trim()) }

function fixAllNone(opts, ans) {
  const rx = /\b(all\s+of\s+the\s+above|none\s+of\s+the\s+above)\b/i
  const removed = []
  const kept = []
  opts.forEach((o, i) => rx.test(o) ? removed.push(i) : kept.push(o))
  if (!removed.length) return { options: opts, answer: ans, changed: false }
  const ansIdx = ans.charCodeAt(0) - 65
  if (removed.includes(ansIdx)) return { options: opts, answer: ans, changed: false, manual: true }
  let newIdx = ansIdx
  for (const ri of removed) if (ri < ansIdx) newIdx--
  return { options: kept, answer: String.fromCharCode(65 + newIdx), changed: true }
}

async function applyFixes(fq) {
  const { id, table, issues } = fq
  const fields = table === 'gp_questions'
    ? 'id, q, options, answer, explanation, broad_topic'
    : 'id, q, options, answer, explanation'
  const { data: q, error } = await supabase.from(table).select(fields).eq('id', id).single()
  if (error || !q) return { id, table, status: 'FETCH_ERROR', error: error?.message, changes: [] }

  const changes = []
  const updates = {}
  let curOpts = (q.options || []).map(o => o || ''), curAns = q.answer

  for (const issue of issues) {
    switch (issue.rule) {
      case 'OPTION_HAS_LABEL': {
        const fixed = fixOptionLabels(curOpts)
        if (JSON.stringify(fixed) !== JSON.stringify(curOpts)) { curOpts = fixed; updates.options = fixed; changes.push('[FIX] Stripped A/B/C labels') }
        break
      }
      case 'ALL_NONE_ABOVE': {
        const r = fixAllNone(curOpts, curAns)
        if (r.manual) changes.push('[MANUAL] All/none is correct answer — needs rewrite')
        else if (r.changed) { curOpts = r.options; curAns = r.answer; updates.options = r.options; updates.answer = r.answer; changes.push(`[FIX] Removed all/none, answer -> ${r.answer}`) }
        break
      }
      case 'INVALID_ANSWER': {
        const n = (q.answer || '').trim().toUpperCase()
        if (/^[A-E]$/.test(n) && n !== q.answer) { updates.answer = n; changes.push(`[FIX] Normalized answer -> ${n}`) }
        else changes.push(`[MANUAL] Invalid answer "${q.answer}"`)
        break
      }
      case 'NEGATIVE_STEM': changes.push('[MANUAL] Negative stem — rewrite to positive SBA'); break
      case 'VIGNETTE_INCOMPLETE': case 'VIGNETTE_WEAK': changes.push(`[MANUAL] Vignette missing: ${issue.missing?.join(', ')}`); break
      case 'VIGNETTE_TOO_SHORT': changes.push('[MANUAL] Expand vignette to 3-8 sentences'); break
      case 'MISSING_EXPLANATION': changes.push('[MANUAL] Add guideline-referenced explanation'); break
      case 'NO_GUIDELINE_CITATION': changes.push('[FLAG] Add guideline citations'); break
      case 'TOO_FEW_OPTIONS': changes.push(`[MANUAL] Need at least 4 options (has ${curOpts.length})`); break
      case 'DUPLICATE_OPTIONS': changes.push('[MANUAL] Remove duplicate options'); break
      case 'ANSWER_OUT_OF_RANGE': changes.push('[MANUAL] Answer letter exceeds option count'); break
      case 'MISSING_BROAD_TOPIC': changes.push('[FLAG] Missing broad_topic'); break
      default: changes.push(`[INFO] ${issue.rule}: ${issue.detail}`)
    }
  }

  if (Object.keys(updates).length > 0 && !DRY_RUN) {
    const { error: ue } = await supabase.from(table).update(updates).eq('id', id)
    if (ue) return { id, table, topic: fq.topic, status: 'UPDATE_ERROR', error: ue.message, changes }
    return { id, table, topic: fq.topic, status: 'FIXED', changes }
  }

  const hasManual = changes.some(c => c.startsWith('[MANUAL]'))
  return { id, table, topic: fq.topic, status: Object.keys(updates).length ? (DRY_RUN ? 'DRY_RUN' : 'FIXED') : (hasManual ? 'NEEDS_MANUAL' : 'FLAGGED'), changes }
}

async function main() {
  console.log(`DOHPass Question Fixer — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)
  let report
  try { report = JSON.parse(readFileSync('scripts/audit-report.json', 'utf8')) }
  catch { console.error('Run audit-questions.mjs first'); process.exit(1) }

  const failed = report.failedQuestions || []
  console.log(`${failed.length} questions to process\n`)

  const results = []
  let fixed = 0, manual = 0, errors = 0

  const startFrom = SKIP
  if (startFrom > 0) console.log(`Skipping first ${startFrom} questions (already processed)\n`)
  for (let i = startFrom; i < failed.length; i += 25) {
    const batch = failed.slice(i, i + 25)
    console.log(`Batch ${Math.floor(i/25)+1}/${Math.ceil(failed.length/25)}...`)
    for (const q of batch) {
      const r = await applyFixes(q)
      results.push(r)
      if (r.status === 'FIXED' || r.status === 'DRY_RUN') fixed++
      else if (r.status === 'NEEDS_MANUAL') manual++
      else if (r.status.includes('ERROR')) errors++
      const icon = r.status === 'FIXED' ? 'v' : r.status === 'NEEDS_MANUAL' ? '!' : 'x'
      console.log(`  [${icon}] ${(r.topic||'').substring(0,30).padEnd(30)} ${r.status}`)
      for (const c of r.changes) console.log(`      ${c}`)
    }
  }

  console.log(`\n${'='.repeat(50)}\n  Fixed: ${fixed} | Manual: ${manual} | Errors: ${errors}\n${'='.repeat(50)}`)

  writeFileSync('scripts/fix-log.json', JSON.stringify({ date: new Date().toISOString(), dryRun: DRY_RUN, summary: { fixed, manual, errors, total: results.length }, results }, null, 2))
  console.log('\nLog saved: scripts/fix-log.json')
}

main().catch(e => { console.error(e); process.exit(1) })
