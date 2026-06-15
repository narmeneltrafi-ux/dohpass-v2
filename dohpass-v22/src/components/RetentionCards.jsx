import { useEffect, useState } from 'react'
import { fetchDueCount, fetchBlueprintCoverage, saveExamDate } from '../lib/supabase'

/* ── shared icon ── */
const IconArrow = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

/* ──────────────────────────────────────────────────────────────
   CARD A — Due today (FSRS)
   ────────────────────────────────────────────────────────────── */
function CardDueToday() {
  const [due, setDue] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchDueCount().then(n => { if (!cancelled) setDue(n) })
    return () => { cancelled = true }
  }, [])

  const loading = due === null

  return (
    <div className="ret-card ret-card--due" role="region" aria-label="Cards due for review">
      <span className="ret-card__eyebrow">Spaced repetition</span>
      {loading ? (
        <span className="ret-card__big ret-card__big--muted">—</span>
      ) : due === 0 ? (
        <p className="ret-card__caught-up">You&apos;re all caught up</p>
      ) : (
        <span className="ret-card__big">{due.toLocaleString()}</span>
      )}
      <span className="ret-card__label">cards due for review</span>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   CARD B — Exam countdown / date picker
   ────────────────────────────────────────────────────────────── */
function CardExamCountdown({ profile, onExamDateSaved }) {
  const [date, setDate]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const today = new Date().toISOString().split('T')[0]

  async function handleSave(e) {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    setError(null)
    const { error: err } = await saveExamDate(date, null)
    setSaving(false)
    if (err) { setError('Could not save. Try again.'); return }
    onExamDateSaved(date)
  }

  if (profile?.exam_date) {
    const daysLeft = Math.max(0, Math.ceil(
      (new Date(profile.exam_date).getTime() - Date.now()) / 86400000
    ))
    const label = profile.exam_name || 'your exam'
    return (
      <div className="ret-card ret-card--exam" role="region" aria-label="Exam countdown">
        <span className="ret-card__eyebrow">Exam countdown</span>
        <span className="ret-card__big ret-card__big--gold">{daysLeft}</span>
        <span className="ret-card__label">
          {daysLeft === 0 ? 'Exam day!' : `days until ${label}`}
        </span>
      </div>
    )
  }

  return (
    <div className="ret-card ret-card--exam" role="region" aria-label="Set your exam date">
      <span className="ret-card__eyebrow">Exam countdown</span>
      <form className="ret-card__date-form" onSubmit={handleSave}>
        <input
          type="date"
          className="ret-card__date-input"
          value={date}
          min={today}
          onChange={e => setDate(e.target.value)}
          required
          aria-label="Exam date"
        />
        {error && <span className="ret-card__error">{error}</span>}
        <button type="submit" className="ret-card__date-btn" disabled={!date || saving}>
          {saving ? 'Saving…' : <>Set date <IconArrow size={12} /></>}
        </button>
      </form>
      <span className="ret-card__label">When is your exam?</span>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   CARD C — Blueprint coverage
   ────────────────────────────────────────────────────────────── */
function CardBlueprintCoverage({ track }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!track) return
    let cancelled = false
    fetchBlueprintCoverage(track).then(data => { if (!cancelled) setRows(data) })
    return () => { cancelled = true }
  }, [track])

  const loading = rows === null
  const trackLabel = track === 'specialist' ? 'Specialist' : track === 'gp' ? 'GP' : track

  return (
    <div className="ret-card ret-card--blueprint" role="region" aria-label="Blueprint coverage">
      <span className="ret-card__eyebrow">Blueprint coverage · {trackLabel}</span>
      {loading && <span className="ret-card__label">Loading…</span>}
      {!loading && rows.length === 0 && (
        <span className="ret-card__label">Start answering questions to see coverage.</span>
      )}
      {!loading && rows.length > 0 && (
        <ul className="ret-bp__list" aria-label="Coverage by topic">
          {rows.map(({ topic, pct }) => (
            <li key={topic} className="ret-bp__row">
              <span className="ret-bp__topic">{topic}</span>
              <span className="ret-bp__pct">{pct}%</span>
              <div className="ret-bp__rail" aria-hidden="true">
                <div className="ret-bp__fill" style={{ width: `${pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   PUBLIC — mount all three cards
   ────────────────────────────────────────────────────────────── */
export default function RetentionCards({ profile, onExamDateSaved }) {
  // Derive track: all_access users default to specialist; otherwise use plan directly.
  const plan = profile?.plan
  const track = plan === 'gp' ? 'gp' : 'specialist'

  return (
    <div className="ret-cards" role="group" aria-label="Retention overview">
      <CardDueToday />
      <CardExamCountdown profile={profile} onExamDateSaved={onExamDateSaved} />
      <CardBlueprintCoverage track={track} />
    </div>
  )
}
