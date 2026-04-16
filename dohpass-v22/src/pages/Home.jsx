import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, fetchProgress, getProfile } from '../lib/supabase'

/* ── 3-D tilt hook (from 21st.dev ExamTrackCard) ─────────────── */
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
      const px = (e.clientX - r.left) / r.width   // 0–1
      const py = (e.clientY - r.top)  / r.height  // 0–1
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
const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)
const IconLogOut = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
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

/* ── Stat pill (21st.dev StatPill) ────────────────────────────── */
const STAT_ICONS = {
  questions: <IconHelpCircle />,
  tracks:    <IconMonitor />,
  format:    <IconShield />,
}

function StatPill({ type, value, label }) {
  return (
    <div className="sp">
      <div className="sp-icon">{STAT_ICONS[type]}</div>
      <div className="sp-text">
        <span className="sp-val">{value}</span>
        <span className="sp-lbl">{label}</span>
      </div>
    </div>
  )
}

/* ── Track card (21st.dev ExamTrackCard) ──────────────────────── */
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
      {/* Gradient header (replaces image from 21st.dev) */}
      <div className={`tc-hd tc-hd--${variant}`}>
        <div className="tc-hd-icon">{icon}</div>
        <span className={`tc-hd-badge tc-hd-badge--${variant}`}>{badge}</span>
        <div className="tc-hd-shimmer" />
      </div>

      {/* Content area */}
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

      {/* Hover glow */}
      <div className={`tc-glow tc-glow--${variant}`} />
    </div>
  )
}

/* ── Plan badge ───────────────────────────────────────────────── */
function planInfo(profile) {
  if (!profile) return null
  const { plan, is_paid } = profile
  if (plan === 'all_access' || (is_paid && plan !== 'gp' && plan !== 'specialist')) {
    return { label: 'All Access', cls: 'plan-badge--all' }
  }
  if (plan === 'specialist') return { label: 'Specialist', cls: 'plan-badge--gold' }
  if (plan === 'gp')         return { label: 'GP Plan',    cls: 'plan-badge--blue' }
  return { label: 'Free',    cls: 'plan-badge--free' }
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)

  useEffect(() => { getProfile().then(setProfile) }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const badge = planInfo(profile)

  return (
    <div className="hw">
      {/* Floating orbs — mirrors 21st.dev animated background */}
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      {/* Nav */}
      <nav className="hw-nav">
        <div className="hw-nav-logo">
          <span className="hw-nav-cross"><IconCross /></span>
          <span className="hw-nav-brand">DOH<span>Pass</span></span>
        </div>
        <div className="hw-nav-right">
          {badge && (
            <span className={`plan-badge ${badge.cls}`}>{badge.label}</span>
          )}
          {(!profile || profile.plan === 'free') && (
            <button className="hw-nav-upgrade" onClick={() => navigate('/pricing')}>
              Upgrade
            </button>
          )}
          <button className="hw-nav-logout" onClick={handleLogout}>
            <IconLogOut /> Log Out
          </button>
        </div>
      </nav>

      {/* Hero */}
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

        <div className="hw-stats">
          <StatPill type="questions" value="1,744" label="Questions" />
          <StatPill type="tracks"    value="2"     label="Exam Tracks" />
          <StatPill type="format"    value="UAE"   label="DOH Format" />
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
            badge="756 Questions"
            variant="gold"
            total={756}
            route="/specialist"
            navigate={navigate}
          />

          <TrackCard
            trackId="gp"
            icon="🩺"
            title="General Practitioner"
            desc="DOH GP track — broad primary care question bank"
            badge="988 Questions"
            variant="blue"
            total={988}
            route="/gp"
            navigate={navigate}
          />

          <TrackCard
            trackId={null}
            icon="🗂"
            title="Flashcards"
            desc="Concept, drug & anatomy cards — Specialist & GP tracks"
            badge="Neurology Live"
            variant="teal"
            total={null}
            route="/gems"
            navigate={navigate}
          />

        </div>
      </div>
    </div>
  )
}
