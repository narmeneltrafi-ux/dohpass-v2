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
  fetchStreak,
  fetchFlashcardDueCount,
  fetchWeakTopics,
  fetchTodayAnswered,
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
/* Drill / target — crosshair */
const IconTarget = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
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
function DashStatsBar({ weekly, totalAnswered, accuracy, streak }) {
  const cells = [
    { label: 'Day Streak',     value: streak,        suffix: '' },
    { label: 'This Week',      value: weekly,        suffix: '' },
    { label: 'Total Answered', value: totalAnswered, suffix: '' },
    { label: 'Accuracy',       value: accuracy,      suffix: '%' },
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
function TrackCard({ Icon, eyebrow, title, desc, count, route, navigate, progress, total, due }) {
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
        {due > 0 && <span className="lp-track__due">{due} due</span>}
      </div>
      <h3 className="lp-track__title">{title}</h3>
      <p className="lp-track__desc">{desc}</p>

      <div className="lp-track__meta">
        <span className="lp-track__count">{count != null ? count.toLocaleString() : '—'} {eyebrow === 'Flashcards' ? 'cards' : 'questions'}</span>
        {hasProgress && <span className="lp-track__pct">{pct}%</span>}
      </div>
      {hasProgress && (
        <div className="lp-track__rail">
          <div className="lp-track__fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      <button className="lp-track__cta" type="button">
        {due > 0 && eyebrow === 'Flashcards' ? `Review ${due} due` : hasProgress ? 'Continue' : 'Start'}
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
  const [counts, setCounts] = useState(null)
  const [weekly, setWeekly] = useState(null)
  const [overall, setOverall] = useState(null)
  const [streak, setStreak] = useState(null)
  const [progSpecialist, setProgSpecialist] = useState(null)
  const [progGP, setProgGP] = useState(null)
  const [flashcardDue, setFlashcardDue] = useState(null)
  const [todayCount, setTodayCount] = useState(null)
  const [drillData, setDrillData] = useState(null)  // { track, topics: [{topic, accuracy}] } | null

  const DAILY_GOAL = 20

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
      fetchStreak(),
      fetchProgress('specialist'),
      fetchProgress('gp'),
      fetchFlashcardDueCount(),
      fetchTodayAnswered(),
    ]).then(([p, c, o, w, s, ps, pg, fd, td]) => {
      if (cancelled) return
      setProfile(p)
      setCounts(c)
      setOverall(o)
      setWeekly(w)
      setStreak(s)
      setProgSpecialist(ps)
      setProgGP(pg)
      setFlashcardDue(fd)
      setTodayCount(td)

      // Fetch weak topics for the track the user primarily uses
      if (!p || !hasAccess(p)) return
      const drillTrack = p.diagnostic_track
        || (ps?.answered >= pg?.answered ? 'specialist' : 'gp')
      fetchWeakTopics(drillTrack).then(topics => {
        if (!cancelled && topics.length > 0) setDrillData({ track: drillTrack, topics })
      })
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

      {profile && !profile.diagnostic_completed_at && (
        <div className="diag-dash-banner" role="banner" aria-label="Readiness check prompt">
          <div className="diag-dash-banner__body">
            <strong className="diag-dash-banner__title">Discover your exam gaps</strong>
            <span className="diag-dash-banner__sub">
              20 questions · 10 topics · ~10 min — see exactly where to focus.
            </span>
          </div>
          <button
            type="button"
            className="diag-dash-banner__cta"
            onClick={() => navigate('/diagnostic')}
          >
            Start <IconArrow size={13} />
          </button>
        </div>
      )}

      <header className="lp-dash__hero">
        <h1 className="lp-dash__h1">
          Welcome back, <span className="lp-dash__h1-name">{firstName}</span>
        </h1>
        <p className="lp-dash__sub">{subhead}</p>
      </header>

      <div className="lp-statswrap lp-dash__statswrap">
        <DashStatsBar
          streak={streak}
          weekly={weekly}
          totalAnswered={totalAnswered}
          accuracy={accuracy}
        />
      </div>

      {todayCount !== null && (
        <div className="lp-goal" role="region" aria-label="Daily goal progress">
          <div className="lp-goal__left">
            <span className="lp-goal__label">Today's goal</span>
            <span className={`lp-goal__count${todayCount >= DAILY_GOAL ? ' lp-goal__count--met' : ''}`}>
              {todayCount} <span className="lp-goal__target">/ {DAILY_GOAL}</span>
            </span>
          </div>
          <div className="lp-goal__track" aria-hidden="true">
            <div
              className={`lp-goal__fill${todayCount >= DAILY_GOAL ? ' lp-goal__fill--met' : ''}`}
              style={{ width: `${Math.min(100, Math.round((todayCount / DAILY_GOAL) * 100))}%` }}
            />
          </div>
          <span className="lp-goal__msg">
            {todayCount === 0
              ? 'Start answering to hit your goal'
              : todayCount >= DAILY_GOAL
                ? 'Goal met today!'
                : `${DAILY_GOAL - todayCount} to go`}
          </span>
        </div>
      )}

      <section className="lp-dash__section" aria-labelledby="lp-tracks-h">
        <h2 className="lp-dash__h2" id="lp-tracks-h">Your tracks</h2>
        <div className="lp-track-grid">
          <TrackCard
            Icon={IconStethoscope}
            eyebrow="Specialist"
            title="Internal Medicine Specialist"
            desc="Cardiology, Respiratory, Nephrology and the rest of the specialist blueprint."
            count={counts?.specialist}
            route="/specialist"
            navigate={navigate}
            progress={progSpecialist}
            total={counts?.specialist}
          />
          <TrackCard
            Icon={IconHeartPulse}
            eyebrow="GP"
            title="General Practice"
            desc="Broad primary-care coverage mapped to the DOH GP blueprint."
            count={counts?.gp}
            route="/gp"
            navigate={navigate}
            progress={progGP}
            total={counts?.gp}
          />
          <TrackCard
            Icon={IconLayers}
            eyebrow="Flashcards"
            title="Concept &amp; Drug Cards"
            desc="High-yield concept, drug and anatomy cards across both tracks."
            count={counts?.flashcards}
            route="/gems"
            navigate={navigate}
            progress={null}
            total={null}
            due={flashcardDue ?? 0}
          />
        </div>
      </section>

      {drillData && (
        <section className="lp-dash__section" aria-labelledby="lp-drill-h">
          <h2 className="lp-dash__h2" id="lp-drill-h">Focus drill</h2>
          <div
            className="lp-drill"
            onClick={() => navigate(`/${drillData.track}?drill=1`)}
            role="button"
            tabIndex={0}
            aria-label={`Start weak-topic drill for ${drillData.track}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/${drillData.track}?drill=1`) } }}
          >
            <span className="lp-drill__icon"><IconTarget /></span>
            <div className="lp-drill__body">
              <h3 className="lp-drill__title">Drill your weak spots</h3>
              <p className="lp-drill__topics">
                {drillData.topics.map(t => (
                  <span key={t.topic} className="lp-drill__chip">
                    {t.topic} <span className="lp-drill__chip-pct">{t.accuracy}%</span>
                  </span>
                ))}
              </p>
            </div>
            <span className="lp-drill__arrow"><IconArrow size={18} /></span>
          </div>
        </section>
      )}

      {hasAccess(profile) && (
        <section className="lp-dash__section" aria-labelledby="lp-tutor-h">
          <h2 className="lp-dash__h2" id="lp-tutor-h">AI Tutor</h2>
          <div
            className="lp-tutor-cta"
            onClick={() => navigate('/tutor')}
            role="button"
            tabIndex={0}
            aria-label="Open your personal AI tutor"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/tutor') } }}
          >
            <span className="lp-tutor-cta__icon" aria-hidden="true">✦</span>
            <div className="lp-tutor-cta__body">
              <h3 className="lp-tutor-cta__title">Ask your personal tutor</h3>
              <p className="lp-tutor-cta__desc">
                Powered by your progress data — ask clinical questions, get practice problems, and understand your weak spots.
              </p>
            </div>
            <span className="lp-tutor-cta__arrow"><IconArrow size={18} /></span>
          </div>
        </section>
      )}

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
