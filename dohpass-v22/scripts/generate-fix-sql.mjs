#!/usr/bin/env node
/**
 * Generates SQL UPDATE statements to fix all question issues.
 * Outputs SQL files that can be pasted into Supabase SQL Editor.
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing env vars'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function esc(s) { return (s || '').replace(/'/g, "''") }

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
  const sqlParts = []
  let fixCount = 0

  for (const table of ['specialist_questions', 'gp_questions']) {
    console.log(`Fetching ${table}...`)
    const qs = await fetchAll(table, 'id, options, answer')
    console.log(`  ${qs.length} questions`)

    for (const q of qs) {
      const opts = q.options || []
      const hasLabels = opts.some(o => o && /^[A-E][\.\)\:\s]/.test(o.trim()))
      const hasAllNone = opts.some(o => o && /\b(all|none)\s+of\s+the\s+above\b/i.test(o))
      const hasNull = opts.some(o => o === null || o === '')
      const needsAnswerNorm = q.answer && q.answer !== q.answer.trim().toUpperCase() && /^[a-eA-E]$/.test(q.answer.trim())

      if (!hasLabels && !hasAllNone && !hasNull && !needsAnswerNorm) continue

      const fixed = opts.map(o => stripLabel(o)).filter(o => o && !/\b(all|none)\s+of\s+the\s+above\b/i.test(o))

      // Remap answer if options were removed
      let newAnswer = (q.answer || '').trim().toUpperCase()
      if (fixed.length < opts.length) {
        // Check if the removed options shift the answer index
        const origIdx = newAnswer.charCodeAt(0) - 65
        const origOpt = opts[origIdx]
        if (origOpt && /\b(all|none)\s+of\s+the\s+above\b/i.test(origOpt)) {
          // Can't auto-fix — skip
          sqlParts.push(`-- SKIP ${table} ${q.id}: answer points to "all/none of the above"`)
          continue
        }
        // Find where the original correct option ended up
        const strippedOrig = stripLabel(origOpt)
        const newIdx = fixed.indexOf(strippedOrig)
        if (newIdx >= 0) newAnswer = String.fromCharCode(65 + newIdx)
      }

      const arrayLiteral = `ARRAY[${fixed.map(o => `'${esc(o)}'`).join(',')}]`
      let updates = [`options = ${arrayLiteral}`]
      if (newAnswer !== q.answer) updates.push(`answer = '${esc(newAnswer)}'`)

      sqlParts.push(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = '${q.id}';`)
      fixCount++
    }
  }

  // Split into batches of 500 for the SQL Editor
  const BATCH = 500
  const totalBatches = Math.ceil(sqlParts.length / BATCH)

  for (let i = 0; i < sqlParts.length; i += BATCH) {
    const batch = sqlParts.slice(i, i + BATCH)
    const batchNum = Math.floor(i / BATCH) + 1
    const filename = `scripts/fix-sql-batch-${batchNum}.sql`
    const content = `-- DOHPass Question Fix — Batch ${batchNum}/${totalBatches}\n-- Generated ${new Date().toISOString()}\n-- Fixes: strip A/B/C labels, remove null options, normalize answers\n-- ${batch.length} statements\n\nBEGIN;\n\n${batch.join('\n')}\n\nCOMMIT;\n`
    writeFileSync(filename, content)
    console.log(`  Wrote ${filename} (${batch.length} statements)`)
  }

  console.log(`\nTotal: ${fixCount} questions to fix across ${totalBatches} SQL batch file(s)`)
  console.log('Paste each file into Supabase SQL Editor and run.')
}

main().catch(e => { console.error(e); process.exit(1) })
