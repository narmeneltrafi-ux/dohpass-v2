import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getProfile } from '../lib/supabase'

/* ── Status helpers ───────────────────────────────────────────── */
function statusColor(pct) {
  if (pct >= 100) return '#22c55e'
  if (pct >= 75)  return '#eab308'
  if (pct >= 50)  return '#f97316'
  return '#ef4444'
}

function statusLabel(pct) {
  if (pct >= 100) return 'COMPLETE'
  if (pct >= 75)  return 'NEAR'
  if (pct >= 50)  return 'PARTIAL'
  return 'GAP'
}

/* ── Tiny markdown renderer ───────────────────────────────────── */
// Handles: "## " section headers, -/•/* bullets, **bold** inline.
function renderInline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>
    }
    return <span key={`${keyBase}-${i}`}>{p}</span>
  })
}

function Markdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const out = []
  let bullets = []

  const flushBullets = (key) => {
    if (bullets.length === 0) return
    out.push(
      <ul className='bga-md-ul' key={`ul-${key}`}>
        {bullets.map((b, i) => <li key={`li-${key}-${i}`}>{renderInline(b, `li-${key}-${i}`)}</li>)}
      </ul>
    )
    bullets = []
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (line.startsWith('## ')) {
      flushBullets(idx)
      out.push(<h3 className='bga-md-h' key={`h-${idx}`}>{renderInline(line.slice(3), `h-${idx}`)}</h3>)
    } else if (/^\s*[-•*]\s+/.test(line)) {
      bullets.push(line.replace(/^\s*[-•*]\s+/, ''))
    } else if (line.trim() === '') {
      flushBullets(idx)
    } else {
      flushBullets(idx)
      out.push(<p className='bga-md-p' key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>)
    }
  })
  flushBullets('end')
  return <div className='bga-md'>{out}</div>
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function BlueprintGapAgent() {
  const navigate = useNavigate()

  const [authState, setAuthState] = useState('loading') // 'loading' | 'admin' | 'denied'
  const [track, setTrack] = useState('specialist')
  const [rows, setRows] = useState([])
  const [rowsLoading, setRowsLoading] = useState(false)

  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  const [drill, setDrill] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const [error, setError] = useState(null)

  /* Admin check on mount */
  useEffect(() => {
    let cancelled = false
    getProfile().then(p => {
      if (cancelled) return
      setAuthState(p?.is_admin ? 'admin' : 'denied')
    })
    return () => { cancelled = true }
  }, [])

  /* Load coverage whenever track changes (once admin confirmed) */
  useEffect(() => {
    if (authState !== 'admin') return
    let cancelled = false
    setRowsLoading(true)
    setAnalysis(null)
    setDrill(null)
    setSelectedTopic(null)
    setError(null)
    supabase.rpc('get_blueprint_coverage', { p_track: track }).then(({ data, error: err }) => {
      if (cancelled) return
      if (err) { setError(err.message); setRows([]) }
      else setRows(data ?? [])
      setRowsLoading(false)
    })
    return () => { cancelled = true }
  }, [authState, track])

  /* Edge-function helper */
  const invoke = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/blueprint-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
    return d
  }, [])

  const runFull = useCallback(async () => {
    setAnalysisLoading(true)
    setDrill(null)
    setSelectedTopic(null)
    setError(null)
    try {
      const d = await invoke({ mode: 'full', track })
      setAnalysis(d.analysis)
    } catch (e) {
      setError(e.message)
    } finally {
      setAnalysisLoading(false)
    }
  }, [invoke, track])

  const runDrill = useCallback(async (topic) => {
    setSelectedTopic(topic)
    setDrillLoading(true)
    setError(null)
    try {
      const d = await invoke({ mode: 'drilldown', track, topic })
      setDrill(d.analysis)
    } catch (e) {
      setError(e.message)
      setDrill(null)
    } finally {
      setDrillLoading(false)
    }
  }, [invoke, track])

  /* ── Auth screens ──────────────────────────────────────────── */
  if (authState === 'loading') {
    return (
      <div className='bga-root bga-center'>
        <Style />
        <p className='bga-muted'>Checking access…</p>
      </div>
    )
  }

  if (authState === 'denied') {
    return (
      <div className='bga-root bga-center'>
        <Style />
        <div className='bga-denied'>
          <h2>Restricted — admin only</h2>
          <p className='bga-muted'>You don't have access to the Blueprint Gap Agent.</p>
          <button className='bga-btn' onClick={() => navigate('/dashboard')}>Back to dashboard</button>
        </div>
      </div>
    )
  }

  /* ── Stats ─────────────────────────────────────────────────── */
  const totalCurrent = rows.reduce((s, r) => s + (r.r_current_q ?? 0), 0)
  const totalTarget  = rows.reduce((s, r) => s + (r.r_target ?? 0), 0)
  const overallPct   = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0
  const criticalGaps = rows.filter(r => (r.r_pct ?? 0) < 50).length
  const atTarget     = rows.filter(r => (r.r_pct ?? 0) >= 100).length

  const worstGaps = [...rows]
    .filter(r => (r.r_pct ?? 0) < 100)
    .sort((a, b) => (a.r_pct ?? 0) - (b.r_pct ?? 0))
    .slice(0, 8)

  return (
    <div className='bga-root'>
      <Style />

      <header className='bga-header'>
        <div>
          <button className='bga-back' onClick={() => navigate('/god-mode')}>← Mission Control</button>
          <h1 className='bga-title'>Blueprint Gap Agent</h1>
          <p className='bga-muted'>Question-bank coverage vs. blueprint targets. Targets are estimates — DOH publishes no official weights.</p>
        </div>
        <div className='bga-track-toggle'>
          <button
            className={`bga-toggle ${track === 'specialist' ? 'is-active' : ''}`}
            onClick={() => setTrack('specialist')}
          >IM Specialist</button>
          <button
            className={`bga-toggle ${track === 'gp' ? 'is-active' : ''}`}
            onClick={() => setTrack('gp')}
          >GP</button>
        </div>
      </header>

      {error && <div className='bga-error'>{error}</div>}

      <div className='bga-stats'>
        <StatCard label='Active Questions' value={totalCurrent} sub={`of ${totalTarget} target`} />
        <StatCard label='Overall Coverage' value={`${overallPct}%`} sub='current / target' accent={statusColor(overallPct)} />
        <StatCard label='Critical Gaps' value={criticalGaps} sub='topics under 50%' accent='#ef4444' />
        <StatCard label='At / Over Target' value={atTarget} sub='topics ≥ 100%' accent='#22c55e' />
      </div>

      <div className='bga-grid'>
        {/* Left: coverage table */}
        <section className='bga-panel'>
          <div className='bga-panel-head'>
            <h2>Coverage by Topic</h2>
            <button className='bga-btn bga-btn-primary' onClick={runFull} disabled={analysisLoading || rowsLoading}>
              {analysisLoading ? 'Analysing…' : 'Run Full Analysis'}
            </button>
          </div>
          <div className='bga-table'>
            {rowsLoading && <p className='bga-muted bga-pad'>Loading coverage…</p>}
            {!rowsLoading && rows.length === 0 && <p className='bga-muted bga-pad'>No coverage data.</p>}
            {!rowsLoading && rows.map((r) => {
              const pct = r.r_pct ?? 0
              const color = statusColor(pct)
              return (
                <button
                  key={r.r_topic}
                  className={`bga-row ${selectedTopic === r.r_topic ? 'is-selected' : ''}`}
                  onClick={() => runDrill(r.r_topic)}
                >
                  <div className='bga-row-top'>
                    <span className='bga-row-topic'>
                      {r.r_topic}
                      {r.r_is_estimate && <span className='bga-est'>~est</span>}
                    </span>
                    <span className='bga-row-count'>{r.r_current_q}/{r.r_target}</span>
                    <span className='bga-badge' style={{ background: color }}>{statusLabel(pct)}</span>
                  </div>
                  <div className='bga-bar'>
                    <div className='bga-bar-fill' style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Right: analysis / drilldown */}
        <section className='bga-panel'>
          <div className='bga-panel-head'>
            <h2>{selectedTopic ? `Drill-down: ${selectedTopic}` : 'AI Analysis'}</h2>
            {selectedTopic && (
              <button className='bga-btn' onClick={() => { setSelectedTopic(null); setDrill(null) }}>
                Close
              </button>
            )}
          </div>
          <div className='bga-analysis'>
            {selectedTopic ? (
              drillLoading
                ? <p className='bga-muted'>Generating build plan…</p>
                : <Markdown text={drill} />
            ) : analysisLoading ? (
              <p className='bga-muted'>The CMCO is reviewing the bank…</p>
            ) : analysis ? (
              <Markdown text={analysis} />
            ) : (
              <p className='bga-muted'>Run a full analysis, or click any topic to drill into it.</p>
            )}
          </div>
        </section>
      </div>

      {/* Priority queue */}
      {worstGaps.length > 0 && (
        <section className='bga-queue'>
          <h2>Priority Action Queue</h2>
          <div className='bga-chips'>
            {worstGaps.map((r) => (
              <button
                key={r.r_topic}
                className='bga-chip'
                style={{ borderColor: statusColor(r.r_pct ?? 0) }}
                onClick={() => runDrill(r.r_topic)}
              >
                <span className='bga-chip-dot' style={{ background: statusColor(r.r_pct ?? 0) }} />
                {r.r_topic}
                <span className='bga-chip-gap'>−{r.r_gap}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className='bga-stat'>
      <div className='bga-stat-value' style={accent ? { color: accent } : undefined}>{value}</div>
      <div className='bga-stat-label'>{label}</div>
      {sub && <div className='bga-stat-sub'>{sub}</div>}
    </div>
  )
}

function Style() {
  return (
    <style>{`
      .bga-root {
        min-height: 100vh;
        background: #0f172a;
        color: #e2e8f0;
        padding: 28px;
        font-family: system-ui, -apple-system, sans-serif;
        box-sizing: border-box;
      }
      .bga-center { display: flex; align-items: center; justify-content: center; }
      .bga-muted { color: #94a3b8; }
      .bga-pad { padding: 16px; }

      .bga-denied { text-align: center; background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 40px; }
      .bga-denied h2 { margin: 0 0 8px; }

      .bga-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
      .bga-back { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; padding: 0 0 10px; }
      .bga-back:hover { color: #e2e8f0; }
      .bga-title { margin: 0 0 6px; font-size: 26px; font-weight: 700; }

      .bga-track-toggle { display: flex; background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 4px; }
      .bga-toggle { background: transparent; color: #94a3b8; border: none; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 14px; font-weight: 600; }
      .bga-toggle.is-active { background: #2563eb; color: #fff; }

      .bga-error { background: #7f1d1d; border: 1px solid #ef4444; color: #fecaca; padding: 12px 16px; border-radius: 10px; margin-bottom: 18px; }

      .bga-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
      .bga-stat { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px; }
      .bga-stat-value { font-size: 28px; font-weight: 800; line-height: 1; }
      .bga-stat-label { margin-top: 8px; font-size: 13px; font-weight: 600; color: #cbd5e1; }
      .bga-stat-sub { margin-top: 2px; font-size: 12px; color: #64748b; }

      .bga-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .bga-panel { background: #1e293b; border: 1px solid #334155; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
      .bga-panel-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid #334155; }
      .bga-panel-head h2 { margin: 0; font-size: 16px; font-weight: 700; }

      .bga-btn { background: #334155; color: #e2e8f0; border: none; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
      .bga-btn:disabled { opacity: 0.5; cursor: default; }
      .bga-btn-primary { background: #2563eb; color: #fff; }

      .bga-table { max-height: 560px; overflow-y: auto; padding: 8px; }
      .bga-row { display: block; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 12px; cursor: pointer; }
      .bga-row:hover { background: #0f172a; border-color: #334155; }
      .bga-row.is-selected { background: #0f172a; border-color: #2563eb; }
      .bga-row-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .bga-row-topic { flex: 1; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; }
      .bga-est { font-size: 10px; color: #64748b; background: #0f172a; border: 1px solid #334155; border-radius: 5px; padding: 1px 5px; }
      .bga-row-count { font-size: 13px; color: #94a3b8; font-variant-numeric: tabular-nums; }
      .bga-badge { font-size: 10px; font-weight: 700; color: #0f172a; padding: 2px 8px; border-radius: 6px; letter-spacing: 0.04em; }
      .bga-bar { height: 6px; background: #0f172a; border-radius: 3px; overflow: hidden; }
      .bga-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }

      .bga-analysis { padding: 18px; overflow-y: auto; max-height: 560px; }
      .bga-md-h { font-size: 14px; font-weight: 800; color: #60a5fa; margin: 18px 0 8px; letter-spacing: 0.03em; }
      .bga-md-h:first-child { margin-top: 0; }
      .bga-md-p { margin: 8px 0; line-height: 1.5; font-size: 14px; }
      .bga-md-ul { margin: 8px 0; padding-left: 20px; }
      .bga-md-ul li { margin: 4px 0; line-height: 1.5; font-size: 14px; }

      .bga-queue { margin-top: 24px; background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 18px; }
      .bga-queue h2 { margin: 0 0 14px; font-size: 16px; font-weight: 700; }
      .bga-chips { display: flex; flex-wrap: wrap; gap: 10px; }
      .bga-chip { display: inline-flex; align-items: center; gap: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 999px; padding: 8px 14px; cursor: pointer; font-size: 13px; font-weight: 600; color: #e2e8f0; }
      .bga-chip:hover { background: #1e293b; }
      .bga-chip-dot { width: 8px; height: 8px; border-radius: 50%; }
      .bga-chip-gap { color: #ef4444; font-variant-numeric: tabular-nums; }

      @media (max-width: 860px) {
        .bga-root { padding: 16px; }
        .bga-stats { grid-template-columns: repeat(2, 1fr); }
        .bga-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  )
}
