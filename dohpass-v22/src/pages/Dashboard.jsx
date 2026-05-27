import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  supabase,
  getProfile,
  hasAccess,
  fetchProgress,
  fetchOverallProgress,
  fetchWeeklyAnswered,
  fetchQuestionCounts,
} from '../lib/supabase'
import CountUp from '../components/CountUp.jsx'
import AppNav from '../components/AppNav.jsx'

/* ───────────────────────────────────────────────────────────────
   ICONS (monochrome line, gold-tinted via currentColor)
   ─────────────────────────────────────────────────────────────── */
const IconArrow = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
/* Specialist track — stethoscope */
const IconStethoscope = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3v6a4 4 0 0 0 8 0V3" />
    <path d="M5 3H3M13 3h2" />
    <path d="M9 13v2a5 5 0 0 0 5 5 5 5 0 0 0 5-5v-1" />
    <circle cx="19" cy="11" r="2" />
  </svg>
)
/* GP track — heart pulse */
const IconHeartPulse = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 12h3.5l2-4 4 8 2-4h5.5" />
    <path d="M21 12.5a5 5 0 0 0-9-3 5 5 0 0 0-9 3 5 5 0 0 0 1.5 3.5L12 21l7.5-5a5 5 0 0 0 1.5-3.5z" opacity=".25" />
  </svg>
)
/* Flashcards — layered cards */
const IconLayers = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="7" width="14" height="12" rx="2" />
    <path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
  </svg>
)
/* Mock exam — clipboard */
const IconClipboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    <path d="M9 11h6M9 15h4" />
  </svg>
)
/* Lock — gated content badge */
const IconLock = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)

function titleCase(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// Fallback chain: full_name first word → first_name (forward-compat, column
// not in current schema but read defensively) → email local-part split on
// ./_/- → friendly "there". All segments are title-cased so we never render
// a lowercase greeting like "huzaifa".
function deriveFirstName(profile, user) {
  const full = profile?.full_name?.trim()
  if (full) return titleCase(full.split(/\s+/)[0])

  const first = profile?.first_name?.trim()
  if (first) return titleCase(first)

  const email = user?.email
  if (email) {
    const local = email.split('@')[0]
    const segment = local.split(/[._-]/)[0]
    if (segment) return titleCase(segment)
  }

  return 'there'
}


/* ───────────────────────────────────────────────────────────────
   STATS BAR — same shape as the landing-page stats
   ─────────────────────────────────────────────────────────────── */
function DashStatsBar({ weekly, totalAnswered, accuracy, bankSize }) {
  const cells = [
    { label: 'This Week',      value: weekly,        suffix: '' },
    { label: 'Total Answered', value: totalAnswered, suffix: '' },
    { label: 'Accuracy',       value: accuracy,      suffix: '%' },
    { label: 'Bank Size',      value: bankSize,      suffix: '+' },
  ]
  return (
    <div className="lp-stats" role="region" aria-label="Your progress at a glance">
      {cells.map((c, i) => (
        <div className="lp-stats__cell" key={i}>
          <span className="lp-stats__label">{c.label}</span>
          <span className="lp-stats__num">
            <CountUp value={c.value ?? null} suffix={c.suffix} />
          </span>
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   GLASS TRACK CARD
   ─────────────────────────────────────────────────────────────── */
function TrackCard({ Icon, eyebrow, title, desc, count, route, navigate, progress, total }) {
  const pct = (progress && total > 0) ? Math.round((progress.answered / total) * 100) : 0
  const hasProgress = progress && progress.answered > 0
  return (
    <article
      className="lp-track"
      onClick={() => navigate(route)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(route) } }}
    >
      <div className="lp-track__top">
        <span className="lp-track__icon"><Icon /></span>
        <span className="lp-track__eyebrow">{eyebrow}</span>
      </div>
      <h3 className="lp-track__title">{title}</h3>
      <p className="lp-track__desc">{desc}</p>

      <div className="lp-track__meta">
        <span className="lp-track__count">{count != null ? count.toLocaleString() : '—'} questions</span>
        {hasProgress && <span className="lp-track__pct">{pct}%</span>}
      </div>
      {hasProgress && (
        <div className="lp-track__rail">
          <div className="lp-track__fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      <button className="lp-track__cta" type="button">
        {hasProgress ? 'Continue' : 'Start'}
        <IconArrow />
      </button>
    </article>
  )
}

/* ───────────────────────────────────────────────────────────────
   PAGE
   ─────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [user, setUser] = useState(null)
  const [counts, setCounts] = useState({ specialist: 0, gp: 0, flashcards: 0 })
  const [weekly, setWeekly] = useState(null)
  const [overall, setOverall] = useState(null)
  const [progSpecialist, setProgSpecialist] = useState(null)
  const [progGP, setProgGP] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setUser(data?.user ?? null)
    })
    Promise.all([
      getProfile(),
      fetchQuestionCounts(),
      fetchOverallProgress(),
      fetchWeeklyAnswered(),
      fetchProgress('specialist'),
      fetchProgress('gp'),
    ]).then(([p, c, o, w, ps, pg]) => {
      if (cancelled) return
      setProfile(p)
      setCounts(c)
      setOverall(o)
      setWeekly(w)
      setProgSpecialist(ps)
      setProgGP(pg)
    })
    return () => { cancelled = true }
  }, [])

  const firstName = deriveFirstName(profile, user)
  // Mock exam is All-Access-only (matches /pricing + the /mock-exam route gate),
  // so it unlocks only with active access AND the all_access plan.
  const mockUnlocked = hasAccess(profile) && profile?.plan === 'all_access'
  const mockTarget = mockUnlocked ? '/mock-exam' : '/checkout?plan=all_access'
  const accuracy = overall && overall.answered > 0
    ? Math.round((overall.correct / overall.answered) * 100)
    : null
  const bankSize = (counts.specialist || 0) + (counts.gp || 0)
  const totalAnswered = overall?.answered ?? null

  let subhead
  if (weekly == null) {
    subhead = 'Loading your weekly progress…'
  } else if (weekly === 0) {
    const isFirstVisit = overall == null || overall.answered === 0
    subhead = isFirstVisit
      ? 'Your exam prep starts here. Pick a track below to answer your first question.'
      : 'No questions answered this week — pick up where you left off.'
  } else {
    subhead = `You've answered ${weekly.toLocaleString()} ${weekly === 1 ? 'question' : 'questions'} this week.`
  }

  return (
    <div className="lp-root lp-dash">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <AppNav />

      <header className="lp-dash__hero">
        <h1 className="lp-dash__h1">
          Welcome back, <span className="lp-dash__h1-name">{firstName}</span>
        </h1>
        <p className="lp-dash__sub">{subhead}</p>
      </header>

      <div className="lp-statswrap lp-dash__statswrap">
        <DashStatsBar
          weekly={weekly}
          totalAnswered={totalAnswered}
          accuracy={accuracy}
          bankSize={bankSize > 0 ? bankSize : null}
        />
      </div>

      <section className="lp-dash__section" aria-labelledby="lp-tracks-h">
        <h2 className="lp-dash__h2" id="lp-tracks-h">Your tracks</h2>
        <div className="lp-track-grid">
          <TrackCard
            Icon={IconStethoscope}
            eyebrow="Specialist"
            title="Internal Medicine Specialist"
            desc="Cardiology, Respiratory, Nephrology and the rest of the specialist blueprint."
            count={counts.specialist}
            route="/specialist"
            navigate={navigate}
            progress={progSpecialist}
            total={counts.specialist}
          />
          <TrackCard
            Icon={IconHeartPulse}
            eyebrow="GP"
            title="General Practice"
            desc="Broad primary-care coverage mapped to the DOH GP blueprint."
            count={counts.gp}
            route="/gp"
            navigate={navigate}
            progress={progGP}
            total={counts.gp}
          />
          <TrackCard
            Icon={IconLayers}
            eyebrow="Flashcards"
            title="Concept &amp; Drug Cards"
            desc="High-yield concept, drug and anatomy cards across both tracks."
            count={counts.flashcards}
            route="/gems"
            navigate={navigate}
            progress={null}
            total={null}
          />
        </div>
      </section>

      <section className="lp-dash__section" aria-labelledby="lp-mock-h">
        <h2 className="lp-dash__h2" id="lp-mock-h">Mock exam</h2>
        <div
          className="lp-mockx"
          onClick={() => navigate(mockTarget)}
          role="button"
          tabIndex={0}
          aria-label={mockUnlocked ? 'Start timed mock exam' : 'Timed mock exam — All Access required, go to checkout'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(mockTarget) } }}
        >
          <span className="lp-mockx__icon"><IconClipboard /></span>
          <div className="lp-mockx__body">
            <h3 className="lp-mockx__title">
              Timed mock exam
              {!mockUnlocked && <span className="lp-mockx__lock"><IconLock /> All Access</span>}
            </h3>
            <p className="lp-mockx__desc">
              {mockUnlocked
                ? '100 questions · 150 minutes · pass mark 60% — simulates the live DOH exam.'
                : 'Unlock with All Access. 100 questions · 150 minutes · pass mark 60% — simulates the live DOH exam.'}
            </p>
          </div>
          <span className="lp-mockx__arrow"><IconArrow size={18} /></span>
        </div>
      </section>
    </div>
  )
}
