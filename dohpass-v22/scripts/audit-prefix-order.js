#!/usr/bin/env node
// Audits legacy prefixed-option rows to confirm the prefix letter matches
// the 0-indexed position. If any row has mismatches, the canonical-first
// resolver ordering (letter→index before prefix match) would mis-score
// those rows. A clean audit is a precondition for applying the resolver.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PREFIX_RE = /^([A-E])[.\)\:]/

async function fetchAllRows(table, selectFields) {
  const PAGE_SIZE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectFields)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

function auditRow(row, table) {
  const opts = Array.isArray(row.options) ? row.options : []
  const prefixes = opts.map(o => {
    const m = PREFIX_RE.exec(String(o).trim().toUpperCase())
    return m ? m[1] : null
  })
  const hasAnyPrefix = prefixes.some(p => p !== null)
  if (!hasAnyPrefix) return { prefixed: false, mismatch: false }

  const mismatches = []
  prefixes.forEach((p, i) => {
    if (p === null) {
      mismatches.push({ position: i, found: '(none)', expected: String.fromCharCode(65 + i) })
      return
    }
    const expected = String.fromCharCode(65 + i)
    if (p !== expected) {
      mismatches.push({ position: i, found: p, expected })
    }
  })

  return {
    prefixed: true,
    mismatch: mismatches.length > 0,
    mismatches,
    id: row.id,
    table,
    options: opts,
    answer: row.answer,
  }
}

async function main() {
  console.log('Prefix-order audit — canonical-first resolver precondition\n')
  const summary = { specialist: 0, gp: 0, prefixed: 0, mismatched: 0 }
  const mismatchRows = []

  for (const table of ['specialist_questions', 'gp_questions']) {
    console.log(`Fetching ${table}...`)
    const rows = await fetchAllRows(table, 'id, options, answer')
    summary[table === 'specialist_questions' ? 'specialist' : 'gp'] = rows.length
    for (const r of rows) {
      const res = auditRow(r, table)
      if (res.prefixed) summary.prefixed += 1
      if (res.mismatch) {
        summary.mismatched += 1
        mismatchRows.push(res)
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(`  specialist_questions: ${summary.specialist}`)
  console.log(`  gp_questions:         ${summary.gp}`)
  console.log(`  rows with any prefix: ${summary.prefixed}`)
  console.log(`  mismatched rows:      ${summary.mismatched}`)
  console.log('='.repeat(70))

  if (mismatchRows.length > 0) {
    console.log('\nMISMATCHES:\n')
    for (const m of mismatchRows) {
      console.log(`  [${m.table}] id=${m.id}  answer=${JSON.stringify(m.answer)}`)
      console.log(`    options:`)
      m.options.forEach((o, i) => console.log(`      [${i}] ${JSON.stringify(o)}`))
      console.log(`    mismatches:`)
      for (const x of m.mismatches) {
        console.log(`      position ${x.position}: found "${x.found}", expected "${x.expected}"`)
      }
      console.log()
    }
    process.exit(2)
  }

  console.log('\nClean — no prefix-order mismatches. Safe to apply canonical-first resolver.')
}

main().catch(e => { console.error(e); process.exit(1) })
