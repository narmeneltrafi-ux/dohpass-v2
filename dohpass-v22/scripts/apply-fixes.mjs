#!/usr/bin/env node
/**
 * Applies all option label fixes using the service role key.
 * Strips A/B/C labels, removes null/empty options, removes "all/none of the above".
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function stripLabel(opt) { return (opt || '').replace(/^[A-E][\.\)\:\s]+\s*/, '').trim() }

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
  let totalFixed = 0, totalSkipped = 0, totalErrors = 0

  for (const table of ['specialist_questions', 'gp_questions']) {
    console.log(`\nProcessing ${table}...`)
    const qs = await fetchAll(table, 'id, options, answer')
    console.log(`  ${qs.length} questions fetched`)

    let fixed = 0, skipped = 0, errors = 0

    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]
      const opts = q.options || []
      const hasLabels = opts.some(o => o && /^[A-E][\.\)\:\s]/.test(o.trim()))
      const hasAllNone = opts.some(o => o && /\b(all|none)\s+of\s+the\s+above\b/i.test(o))
      const hasNull = opts.some(o => o === null || o === '')
      const needsAnswerNorm = q.answer && q.answer !== q.answer.trim().toUpperCase() && /^[a-eA-E]$/.test(q.answer.trim())

      if (!hasLabels && !hasAllNone && !hasNull && !needsAnswerNorm) { skipped++; continue }

      // Strip labels and remove nulls
      let newOpts = opts.map(o => stripLabel(o)).filter(o => o.length > 0)

      // Remove "all/none of the above"
      const allNoneIdx = newOpts.findIndex(o => /\b(all|none)\s+of\s+the\s+above\b/i.test(o))
      const origAnswer = (q.answer || '').trim().toUpperCase()
      const origIdx = origAnswer.charCodeAt(0) - 65

      if (allNoneIdx >= 0) {
        if (origIdx === allNoneIdx) {
          // Answer IS "all/none of the above" — skip, needs manual rewrite
          skipped++
          continue
        }
        // Remove it and remap answer
        const origText = stripLabel(opts[origIdx])
        newOpts = newOpts.filter((_, i) => i !== allNoneIdx)
        const newIdx = newOpts.indexOf(origText)
        if (newIdx < 0) { skipped++; continue }
      }

      // Determine new answer
      let newAnswer = origAnswer
      if (newOpts.length !== opts.filter(o => o && o.trim()).length || hasNull) {
        const origText = stripLabel(opts[origIdx])
        const ni = newOpts.indexOf(origText)
        if (ni >= 0) newAnswer = String.fromCharCode(65 + ni)
      }
      if (needsAnswerNorm) newAnswer = origAnswer

      const updates = { options: newOpts }
      if (newAnswer !== q.answer) updates.answer = newAnswer

      const { error, data } = await supabase.from(table).update(updates).eq('id', q.id).select('id')
      if (error) {
        console.error(`  ERROR ${q.id}: ${error.message}`)
        errors++
      } else if (!data || data.length === 0) {
        console.error(`  NO MATCH ${q.id}`)
        errors++
      } else {
        fixed++
      }

      // Progress every 250
      if ((fixed + skipped + errors) % 250 === 0) {
        process.stdout.write(`  Progress: ${fixed + skipped + errors}/${qs.length} (${fixed} fixed)\r`)
      }
    }

    console.log(`  Done: ${fixed} fixed, ${skipped} unchanged, ${errors} errors`)
    totalFixed += fixed
    totalSkipped += skipped
    totalErrors += errors
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`  TOTAL: ${totalFixed} fixed | ${totalSkipped} unchanged | ${totalErrors} errors`)
  console.log('='.repeat(50))
}

main().catch(e => { console.error(e); process.exit(1) })
