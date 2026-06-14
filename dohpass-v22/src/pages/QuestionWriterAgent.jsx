// src/pages/QuestionWriterAgent.jsx
//
// God Mode — Question Writer Agent.
// Generates DOH-style one-best-answer items (NBME standard), runs an adversarial
// examiner review server-side, then lets the admin stage PASS/EDIT items as DRAFTS
// (is_active=false) and approve them to live in a separate queue.
//
// No payments, no RLS changes. Writes (insert/approve/discard) route through the
// edge function, which re-checks is_admin server-side via the service role — direct
// client writes to the question tables are blocked by RLS.

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-questions-agent`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callAgent(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const SPECIALIST_SYSTEMS = [
  'Cardiology', 'Respiratory', 'Gastroenterology', 'Endocrinology', 'Nephrology',
  'Neurology', 'Rheumatology', 'Haematology', 'Oncology', 'Infectious Disease',
  'Geriatrics', 'Palliative Care', 'Dermatology', 'Immunology', 'Biostatistics',
]

const GP_SYSTEMS = [
  'Cardiology', 'Respiratory', 'Endocrinology', 'Renal', 'Gastroenterology',
  'Neurology', 'Psychiatry', 'Dermatology', 'Rheumatology', 'Haematology',
  'Infectious Disease', "Women's Health", 'Paediatrics', 'Preventive', 'Primary Care',
]

const VERDICT_STYLE = {
  PASS:   { bg: '#052e1a', border: '#16a34a', label: 'PASS',   color: '#4ade80' },
  EDIT:   { bg: '#2e2305', border: '#d97706', label: 'EDIT',   color: '#fbbf24' },
  REJECT: { bg: '#2e0808', border: '#dc2626', label: 'REJECT', color: '#f87171' },
}

export default function QuestionWriterAgent() {
  const [track, setTrack] = useState('specialist')
  const [topic, setTopic] = useState('Cardiology')
  const [subtopic, setSubtopic] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [count, setCount] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [inserting, setInserting] = useState({})
  const [inserted, setInserted] = useState({})
  const [tab, setTab] = useState('generate')

  const systems = track === 'specialist' ? SPECIALIST_SYSTEMS : GP_SYSTEMS

  useEffect(() => {
    if (!systems.includes(topic)) setTopic(systems[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track])

  // ─────────────────────────────── GENERATE ───────────────────────────────
  async function runGenerate() {
    setError('')
    setResult(null)
    setInserted({})
    setLoading(true)
    try {
      const data = await callAgent({
        action: 'generate',
        track,
        topic,
        subtopic: subtopic.trim() || undefined,
        difficulty: difficulty || undefined,
        count,
      })
      setResult(data)
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────── INSERT AS DRAFT ────────────────────────────
  async function insertDraft(idx) {
    if (!result) return
    const row = result.items[idx]
    setInserting((s) => ({ ...s, [idx]: true }))
    try {
      const data = await callAgent({
        action: 'insert',
        track,
        item: row.candidate,
        review: { verdict: row.verdict, flaws: row.flaws, clinical_note: row.clinical_note },
      })
      setInserted((s) => ({ ...s, [idx]: data.id }))
    } catch (e) {
      setError(`Insert failed: ${e.message || e}`)
    } finally {
      setInserting((s) => ({ ...s, [idx]: false }))
    }
  }

  // ───────────────────────────────── UI ───────────────────────────────────
  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <Link to='/god-mode' style={S.back}>← God Mode</Link>
        <h1 style={S.h1}>Question Writer Agent</h1>
        <p style={S.sub}>
          NBME one-best-answer generation → adversarial examiner review → draft staging.
          Items land as <b>drafts (inactive)</b>; approve them in the Pending tab.
        </p>
      </div>
      <div style={S.tabs}>
        <button style={tab === 'generate' ? S.tabOn : S.tab} onClick={() => setTab('generate')}>Generate</button>
        <button style={tab === 'pending' ? S.tabOn : S.tab} onClick={() => setTab('pending')}>Pending</button>
      </div>
      {tab === 'generate' && (
        <>
          <div style={S.panel}>
            <div style={S.row}>
              <Field label='Track'>
                <select value={track} onChange={(e) => setTrack(e.target.value)} style={S.input}>
                  <option value='specialist'>Specialist (IM)</option>
                  <option value='gp'>GP</option>
                </select>
              </Field>
              <Field label='System'>
                <select value={topic} onChange={(e) => setTopic(e.target.value)} style={S.input}>
                  {systems.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label='Difficulty'>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={S.input}>
                  <option value=''>Mixed (Mod/Hard)</option>
                  <option value='Easy'>Easy</option>
                  <option value='Moderate'>Moderate</option>
                  <option value='Hard'>Hard</option>
                </select>
              </Field>
              <Field label='Count (max 4)'>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={S.input}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            </div>
            <Field label='Subtopic (optional — blank = agent picks high-yield)'>
              <input
                value={subtopic}
                onChange={(e) => setSubtopic(e.target.value)}
                placeholder='e.g. Acute coronary syndrome'
                style={S.input}
              />
            </Field>
            <button onClick={runGenerate} disabled={loading} style={loading ? S.runBusy : S.run}>
              {loading ? 'Generating + reviewing… (~10–20s)' : 'Generate & Review'}
            </button>
          </div>
          {error && <div style={S.err}>{error}</div>}
          {result && (
            <div style={S.results}>
              <div style={S.summary}>
                {result.count} generated · <b style={{ color: '#4ade80' }}>{result.pass_count} passed</b>
                {' '}{result.count - result.pass_count} flagged · {result.model}
              </div>
              {result.items.map((item, idx) => (
                <ItemCard
                  key={idx}
                  idx={idx}
                  item={item}
                  inserting={!!inserting[idx]}
                  insertedId={inserted[idx]}
                  onInsert={() => insertDraft(idx)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'pending' && <PendingQueue track={track} setTrack={setTrack} />}
    </div>
  )
}

// ─────────────────────────────── Item card ────────────────────────────────
function ItemCard({ idx, item, inserting, insertedId, onInsert }) {
  const v = VERDICT_STYLE[item.verdict] || VERDICT_STYLE.REJECT
  const c = item.candidate
  const canInsert = item.verdict === 'PASS' || item.verdict === 'EDIT'
  const [open, setOpen] = useState(item.verdict !== 'PASS')

  return (
    <div style={{ ...S.card, borderColor: v.border, background: v.bg }}>
      <div style={S.cardTop}>
        <span style={{ ...S.badge, color: v.color, borderColor: v.border }}>{v.label}</span>
        <span style={S.cardMeta}>{c.topic}{c.subtopic ? ` · ${c.subtopic}` : ''} · {c.difficulty}</span>
        {item.verdict === 'EDIT' && <span style={S.editTag}>auto-corrected by reviewer</span>}
      </div>
      {item.flaws?.length > 0 && (
        <div style={S.flaws}>
          {item.flaws.map((f, i) => <div key={i} style={S.flawLine}>⚠ {f}</div>)}
        </div>
      )}
      {item.clinical_note && <div style={S.clinical}>🩺 {item.clinical_note}</div>}
      <div style={S.vignette}>{c.vignette}</div>
      <div style={S.leadIn}>{c.lead_in}</div>
      <div style={S.opts}>
        {c.options.map((o, i) => {
          const letter = o.trim()[0]
          const correct = letter === c.answer
          return (
            <div key={i} style={correct ? S.optCorrect : S.opt}>
              {o}{correct ? ' ✓' : ''}
            </div>
          )
        })}
      </div>
      <button style={S.toggle} onClick={() => setOpen((x) => !x)}>
        {open ? 'Hide explanation' : 'Show explanation'}
      </button>
      {open && (
        <div style={S.expl}>
          {c.explanation}
          {c.citation && <div style={S.cite}>Source: {c.citation}</div>}
        </div>
      )}
      <div style={S.cardActions}>
        {insertedId ? (
          <span style={S.staged}>✓ Staged as draft ({insertedId.slice(0, 8)}) — approve in Pending tab</span>
        ) : canInsert ? (
          <button onClick={onInsert} disabled={inserting} style={inserting ? S.insertBusy : S.insert}>
            {inserting ? 'Staging…' : 'Insert as draft'}
          </button>
        ) : (
          <span style={S.rejectedNote}>Rejected — not insertable. Regenerate or fix the prompt.</span>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────── Pending queue ──────────────────────────────
function PendingQueue({ track, setTrack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState({})
  const [err, setErr] = useState('')

  const table = track === 'specialist' ? 'specialist_questions' : 'gp_questions'

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data, error } = await supabase
        .from(table)
        .select('id, topic, subtopic, q, options, answer, explanation, difficulty, review_metadata, created_at')
        .eq('source', 'agent')
        .eq('is_active', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }, [table])

  useEffect(() => { load() }, [load])

  async function approve(id) {
    setBusy((s) => ({ ...s, [id]: 'approve' }))
    try {
      await callAgent({ action: 'approve', track, id })
      setRows((r) => r.filter((x) => x.id !== id))
    } catch (e) { setErr(String(e.message || e)) }
    finally { setBusy((s) => ({ ...s, [id]: null })) }
  }

  async function discard(id) {
    if (!confirm('Delete this draft permanently?')) return
    setBusy((s) => ({ ...s, [id]: 'discard' }))
    try {
      await callAgent({ action: 'discard', track, id })
      setRows((r) => r.filter((x) => x.id !== id))
    } catch (e) { setErr(String(e.message || e)) }
    finally { setBusy((s) => ({ ...s, [id]: null })) }
  }

  return (
    <div style={S.panel}>
      <div style={S.row}>
        <Field label='Track'>
          <select value={track} onChange={(e) => setTrack(e.target.value)} style={S.input}>
            <option value='specialist'>Specialist (IM)</option>
            <option value='gp'>GP</option>
          </select>
        </Field>
        <button onClick={load} style={S.refresh}>Refresh</button>
      </div>
      {err && <div style={S.err}>{err}</div>}
      {loading && <div style={S.dim}>Loading drafts…</div>}
      {!loading && rows.length === 0 && <div style={S.dim}>No pending drafts for this track.</div>}
      {rows.map((r) => {
        const m = r.review_metadata || {}
        const v = VERDICT_STYLE[m.verdict] || VERDICT_STYLE.PASS
        return (
          <div key={r.id} style={{ ...S.card, borderColor: v.border, background: v.bg }}>
            <div style={S.cardTop}>
              <span style={{ ...S.badge, color: v.color, borderColor: v.border }}>{m.verdict || 'PASS'}</span>
              <span style={S.cardMeta}>{r.topic}{r.subtopic ? ` · ${r.subtopic}` : ''} · {r.difficulty}</span>
              {m.was_edited && <span style={S.editTag}>was auto-corrected</span>}
            </div>
            <div style={S.vignette}>{r.q}</div>
            <div style={S.opts}>
              {(r.options || []).map((o, i) => {
                const correct = o.trim()[0] === r.answer
                return <div key={i} style={correct ? S.optCorrect : S.opt}>{o}{correct ? ' ✓' : ''}</div>
              })}
            </div>
            <div style={S.expl}>{r.explanation}</div>
            <div style={S.cardActions}>
              <button onClick={() => approve(r.id)} disabled={!!busy[r.id]} style={S.approve}>
                {busy[r.id] === 'approve' ? 'Publishing…' : 'Approve & Publish'}
              </button>
              <button onClick={() => discard(r.id)} disabled={!!busy[r.id]} style={S.discard}>
                {busy[r.id] === 'discard' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={S.field}>
      <span style={S.label}>{label}</span>
      {children}
    </label>
  )
}

// ─────────────────────────────── styles ───────────────────────────────────
const S = {
  wrap:         { maxWidth: 860, margin: '0 auto', padding: '24px 16px 80px', color: '#e5e7eb' },
  head:         { marginBottom: 20 },
  back:         { color: '#8b5cf6', textDecoration: 'none', fontSize: 14 },
  h1:           { fontSize: 26, fontWeight: 700, margin: '10px 0 4px' },
  sub:          { fontSize: 14, color: '#9ca3af', lineHeight: 1.5, margin: 0 },
  tabs:         { display: 'flex', gap: 8, marginBottom: 16 },
  tab:          { padding: '8px 16px', borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 14 },
  tabOn:        { padding: '8px 16px', borderRadius: 8, border: '1px solid #8b5cf6', background: '#1e1b4b', color: '#c4b5fd', cursor: 'pointer', fontSize: 14 },
  panel:        { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  row:          { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' },
  field:        { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 160px', marginBottom: 4 },
  label:        { fontSize: 12, color: '#9ca3af', fontWeight: 600 },
  input:        { padding: '9px 11px', borderRadius: 8, border: '1px solid #374151', background: '#0f172a', color: '#e5e7eb', fontSize: 14 },
  run:          { width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#8b5cf6', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8 },
  runBusy:      { width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#6d28d9', color: '#ddd6fe', fontSize: 15, fontWeight: 600, cursor: 'not-allowed', marginTop: 8 },
  refresh:      { padding: '9px 16px', borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 14 },
  err:          { background: '#2e0808', border: '1px solid #dc2626', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 14, marginBottom: 12 },
  dim:          { color: '#6b7280', fontSize: 14, padding: '12px 0' },
  results:      { display: 'flex', flexDirection: 'column', gap: 14 },
  summary:      { fontSize: 14, color: '#cbd5e1', padding: '4px 2px' },
  card:         { border: '1px solid', borderRadius: 12, padding: 16 },
  cardTop:      { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  badge:        { fontSize: 11, fontWeight: 800, letterSpacing: 0.5, border: '1px solid', borderRadius: 4, padding: '2px 6px' },
  cardMeta:     { fontSize: 13, color: '#cbd5e1' },
  editTag:      { fontSize: 11, color: '#fbbf24', fontStyle: 'italic' },
  flaws:        { background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 },
  flawLine:     { fontSize: 13, color: '#fca5a5', lineHeight: 1.5 },
  clinical:     { fontSize: 13, color: '#a7f3d0', marginBottom: 10 },
  vignette:     { fontSize: 15, lineHeight: 1.6, color: '#f3f4f6', whiteSpace: 'pre-wrap', marginBottom: 10 },
  leadIn:       { fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 10 },
  opts:         { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 },
  opt:          { fontSize: 14, color: '#d1d5db', padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)' },
  optCorrect:   { fontSize: 14, color: '#bbf7d0', fontWeight: 600, padding: '6px 10px', borderRadius: 6, background: 'rgba(22,163,74,0.15)' },
  toggle:       { background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: 13, padding: '4px 0', marginBottom: 8 },
  expl:         { fontSize: 14, lineHeight: 1.6, color: '#cbd5e1', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 },
  cite:         { marginTop: 8, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  cardActions:  { display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  insert:       { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  insertBusy:   { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#14532d', color: '#86efac', fontSize: 14, fontWeight: 600, cursor: 'not-allowed' },
  approve:      { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  discard:      { padding: '9px 18px', borderRadius: 8, border: '1px solid #dc2626', background: 'transparent', color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  staged:       { fontSize: 13, color: '#86efac', fontWeight: 600 },
  rejectedNote: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
}
