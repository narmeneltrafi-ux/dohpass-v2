import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { fetchProgress, getProfile, fetchQuestionCounts } from '../lib/supabase'

/* ── 3-D tilt hook ──────────────────────────────────────────────── */
function useTilt() {
  const ref = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const frame = useRef(null)

  const onMove = useCallback((e) => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      setTilt({ x: (py - 0.5) * 14, y: (0.5 - px) * 14 })
    })
  }, [])

  const onLeave = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current)
    setTilt({ x: 0, y: 0 })
  }, [])

  return { ref, tilt, onMove, onLeave }
}

/* ── Inline SVG icons ─────────────────────────────────────────── */
const IconPulse = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)
const IconHelpCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
  </svg>
)
const IconMonitor = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)
const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

/* ── Animated stat badge ────────────────────────────────────────── */
const STAT_ICONS = {
  questions: <IconHelpCircle />,
  tracks:    <IconMonitor />,
  format:    <IconShield />,
}

function AnimatedStatBadge({ type, value, label, delay }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div className={`hero-stat${visible ? ' hero-stat--visible' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="hero-stat__icon">{STAT_ICONS[type]}</div>
      <div className="hero-stat__text">
        <span className="hero-stat__value">{value}</span>
        <span className="hero-stat__label">{label}</span>
      </div>
    </div>
  )
}

/* ── Track card (3D tilt) ────────────────────────────────────────── */
function TrackCard({ trackId, icon, title, desc, badge, variant, total, route, navigate }) {
  const { ref, tilt, onMove, onLeave } = useTilt()
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    if (!trackId) return
    fetchProgress(trackId).then(p => {
      if (p && p.answered > 0) setProgress(p)
    })
  }, [trackId])

  const pct = progress ? Math.round((progress.answered / total) * 100) : 0

  return (
    <div
      ref={ref}
      className={`tc tc--${variant}`}
      style={{ transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={() => navigate(route)}
    >
      <div className={`tc-hd tc-hd--${variant}`}>
        <div className="tc-hd-icon">{icon}</div>
        <span className={`tc-hd-badge tc-hd-badge--${variant}`}>{badge}</span>
        <div className="tc-hd-shimmer" />
      </div>

      <div className="tc-body">
        <h3 className="tc-title">{title}</h3>
        <p className="tc-desc">{desc}</p>

        {progress && (
          <div className="tc-progress">
            <div className="tc-progress-row">
              <span className="tc-progress-answered" style={{ color: `var(--${variant})` }}>
                {progress.answered} answered
              </span>
              <span className="tc-progress-pct">{pct}%</span>
            </div>
            <div className="tc-progress-rail">
              <div
                className="tc-progress-fill"
                style={{ width: `${pct}%`, background: `var(--${variant})` }}
              />
            </div>
          </div>
        )}

        <button className={`tc-cta tc-cta--${variant}`}>
          {progress ? 'Continue' : 'Begin'}
          <span className="tc-cta-icon"><IconArrow /></span>
        </button>
      </div>

      <div className={`tc-glow tc-glow--${variant}`} />
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ specialist: 0, gp: 0, flashcards: 0 })

  useEffect(() => {
    fetchQuestionCounts().then(setCounts)
  }, [])

  return (
    <div className="hw" style={{ paddingTop: '62px' }}>
      {/* Floating orbs */}
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      {/* Hero — Animated stat badges */}
      <div className="hw-hero">
        <div className="hw-eyebrow">
          <IconPulse />
          UAE Medical Licensing
        </div>

        <h1 className="hw-h1">
          <span className="hw-h1-top">Master Your</span>
          <br />
          <span className="hw-h1-bot">Medical Exams</span>
        </h1>

        <p className="hw-sub">
          High-yield questions. Real exam format. UAE-focused.
        </p>

        <div className="hero-stats-row">
          <AnimatedStatBadge type="questions" value={(counts.specialist + counts.gp).toLocaleString()} label="Questions" delay={200} />
          <AnimatedStatBadge type="tracks"    value="2"     label="Exam Tracks" delay={400} />
          <AnimatedStatBadge type="format"    value="UAE"   label="DOH Format" delay={600} />
        </div>

        <div className="hw-hero-ctas">
          <button className="hw-hero-cta hw-hero-cta--primary" onClick={() => navigate('/specialist')}>
            Start Specialist <IconArrow />
          </button>
          <button className="hw-hero-cta hw-hero-cta--secondary" onClick={() => navigate('/gp')}>
            Start GP Track <IconArrow />
          </button>
        </div>
      </div>

      {/* Track cards */}
      <div className="hw-section">
        <h2 className="hw-section-title">Your Exam Tracks</h2>
        <div className="hw-grid">
          <TrackCard
            trackId="specialist"
            icon="🏅"
            title="Internal Medicine Specialist"
            desc="DOH Specialist track — Cardiology, Respiratory, Nephrology & more"
            badge={`${counts.specialist.toLocaleString()} Questions`}
            variant="gold"
            total={counts.specialist}
            route="/specialist"
            navigate={navigate}
          />
          <TrackCard
            trackId="gp"
            icon="🩺"
            title="General Practitioner"
            desc="DOH GP track — broad primary care question bank"
            badge={`${counts.gp.toLocaleString()} Questions`}
            variant="blue"
            total={counts.gp}
            route="/gp"
            navigate={navigate}
          />
          <TrackCard
            trackId={null}
            icon="🗂"
            title="Flashcards"
            desc="Concept, drug & anatomy cards — Specialist & GP tracks"
            badge={`${counts.flashcards.toLocaleString()} Cards`}
            variant="teal"
            total={null}
            route="/gems"
            navigate={navigate}
          />
        </div>
      </div>

      {/* Mock Exam */}
      <div className="hw-section">
        <h2 className="hw-section-title">Mock Exam</h2>
        <div className="hw-mock-banner" onClick={() => navigate('/mock-exam')}>
          <span className="hw-mock-icon">📝</span>
          <div className="hw-mock-text">
            <h3>Timed Mock Exam</h3>
            <p>100 questions, 150 minutes. Simulates the real DOH exam. Pass mark: 60%.</p>
          </div>
          <span className="hw-mock-arrow"><IconArrow /></span>
        </div>
      </div>
    </div>
  )
}
