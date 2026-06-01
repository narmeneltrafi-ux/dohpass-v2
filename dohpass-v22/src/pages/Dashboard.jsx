import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  supabase,
  getProfile,
  hasAccess,
  fetchQuestionCounts,
  fetchStreak,
  fetchWeakTopics,
  fetchUserDashboardStats,
  saveExamDate,
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
/* AI Tutor — chat bubble */
const IconChat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
   EXAM DATE BANNER — shown once until user sets their exam date
   ─────────────────────────────────────────────────────────────── */
function ExamDateBanner({ onSave, onDismiss }) {
  const [date, setDate]       = useState('')
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const today = new Date().toISOString().split('T')[0]

  async function handleSave(e) {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    setError(null)
    const { error: err } = await saveExamDate(date, name.trim() || null)
    setSaving(false)
    if (err) { setError('Could not save. Please try again.'); return }
    onSave({ exam_date: date, exam_name: name.trim() || null })
  }

  return (
    <div className="diag-dash-banner diag-dash-banner--exam" role="banner" aria-label="Set exam date">
      <form className="diag-dash-banner__body" onSubmit={handleSave}>
        <strong className="diag-dash-banner__title">When is your exam?</strong>
        <span className="diag-dash-banner__sub">
          Your AI coach uses this to prioritise what matters most.
        </span>
        <div className="exam-date-inputs">
          <input
            type="text"
            className="exam-date-inputs__name"
            placeholder="Exam name (e.g. DOH Specialist)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
          />
          <input
            type="date"
            className="exam-date-inputs__date"
            value={date}
            min={today}
            onChange={e => setDate(e.target.value)}
            required
          />
        </div>
        {error && <span className="exam-date-inputs__error">{error}</span>}
        <div className="exam-date-inputs__actions">
          <button type="submit" className="diag-dash-banner__cta" disabled={!date || saving}>
            {saving ? 'Saving…' : <>Set date <IconArrow size={13} /></>}
          </button>
          <button type="button" className="diag-skip diag-skip--inline" onClick={onDismiss}>
            Skip
          </button>
        </div>
      </form>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   EXAM COUNTDOWN — days to exam + recommended daily question target
   ─────────────────────────────────────────────────────────────── */
function ExamCountdown({ profile, totalQuestions, totalAnswered }) {
  if (!profile?.exam_date) return null
  const daysLeft = Math.max(0, Math.ceil(
    (new Date(profile.exam_date).getTime() - Date.now()) / 86400000
  ))
  if (daysLeft <= 0) return null
  const remaining    = Math.max(0, (totalQuestions || 0) - (totalAnswered || 0))
  const targetPerDay = remaining > 0 && daysLeft > 0 ? Math.ceil(remaining / daysLeft) : 0
  const examLabel    = profile.exam_name || 'Your exam'
  return (
    <div className="exam-countdown" role="region" aria-label="Exam countdown">
      <div className="exam-countdown__left">
        <span className="exam-countdown__days">{daysLeft}</span>
        <span className="exam-countdown__unit">days to {examLabel}</span>
      </div>
      {targetPerDay > 0 && (
        <div className="exam-countdown__right">
          <span className="exam-countdown__target">{targetPerDay}</span>
          <span className="exam-countdown__target-label">questions/day to finish the bank</span>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   STATS BAR — Accuracy leads; it's the most clinically relevant signal
   ─────────────────────────────────────────────────────────────── */
function DashStatsBar({ weekly, totalAnswered, accuracy, streak }) {
  const cells = [
    { label: 'Overall Accuracy', value: accuracy,      suffix: '%' },
    { label: 'Day Streak',       value: streak,        suffix: '' },
    { label: 'This Week',        value: weekly,        suffix: '' },
    { label: 'Total Answered',   value: totalAnswered, suffix: '' },
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
   READINESS BADGE — shown only when ≥ 20 attempts
   ─────────────────────────────────────────────────────────────── */
function ReadinessBadge({ accuracy, totalAnswered }) {
  if (accuracy === null || totalAnswered === null || totalAnswered < 20) return null
  let label, mod
  if (accuracy >= 75)      { label = 'On track to pass';        mod = 'green' }
  else if (accuracy >= 65) { label = 'Approaching pass mark';   mod = 'gold'  }
  else if (accuracy >= 50) { label = 'Building readiness';      mod = 'blue'  }
  else                     { label = 'Focus on fundamentals';   mod = 'muted' }
  return (
    <div className={`lp-dash__readiness lp-dash__readiness--${mod}`} role="status" aria-label={`Exam readiness: ${label}`}>
      <span className="lp-dash__readiness-dot" aria-hidden="true" />
      {label}
      <span className="lp-dash__readiness-sep" aria-hidden="true">·</span>
      {accuracy}% accuracy
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   UPGRADE PROMPT — free users only
   ─────────────────────────────────────────────────────────────── */
function UpgradePrompt({ navigate }) {
  return (
    <div className="lp-dash__upgrade-wrap">
      <div className="lp-dash__upgrade" role="region" aria-label="Upgrade to full access">
        <div className="lp-dash__upgrade__body">
          <div className="lp-dash__upgrade__title">Unlock your full question bank</div>
          <div className="lp-dash__upgrade__sub">
            You&apos;re in free preview mode. Activate a plan for 30-day full access — one payment, no subscription.
          </div>
        </div>
        <button
          type="button"
          className="lp-dash__upgrade__cta"
          onClick={() => navigate('/pricing')}
        >
          View Plans
        </button>
      </div>
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
  const [examDateDismissed, setExamDateDismissed] = useState(false)

  const DAILY_GOAL = 20

  useEffect(() => {
    let cancelled = false

    // auth.getUser() validates the JWT with the server — share this promise so
    // we call it once and gate the stats RPC on confirmed auth. Without the
    // gate, auth.uid() can return NULL inside the function on a fresh page
    // load (JWT not yet confirmed), making every stat show as zero/dash.
    const userPromise = supabase.auth.getUser()

    userPromise.then(({ data }) => {
      if (cancelled) return
      setUser(data?.user ?? null)
    })

    Promise.all([
      getProfile(),
      fetchQuestionCounts(),
      fetchStreak(),
      // Only call the stats RPC after auth is confirmed — prevents auth.uid()
      // from returning NULL and the function returning NULL silently.
      userPromise.then(({ data }) =>
        data?.user ? fetchUserDashboardStats() : null
      ),
    ]).then(([p, c, s, stats]) => {
      if (cancelled) return
      setProfile(p)
      setCounts(c)
      setStreak(s)
      if (stats) {
        setOverall({
          answered: stats.total_answered,
          correct:  stats.specialist.correct + stats.gp.correct,
        })
        setWeekly(stats.weekly_answered)
        setProgSpecialist(stats.specialist)
        setProgGP(stats.gp)
        setFlashcardDue(stats.flashcard_due)
        setTodayCount(stats.today_answered)
      }

      // Fetch weak topics for the track the user primarily uses
      if (!p || !hasAccess(p)) return
      const drillTrack = p.diagnostic_track
        || (stats?.specialist?.answered >= stats?.gp?.answered ? 'specialist' : 'gp')
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
    subhead = null
  } else if (weekly === 0) {
    const isFirstVisit = overall == null || overall.answered === 0
    subhead = isFirstVisit
      ? 'Pick a track below to answer your first question.'
      : 'No questions this week — pick up where you left off.'
  } else {
    subhead = `${weekly.toLocaleString()} ${weekly === 1 ? 'question' : 'questions'} answered this week.`
  }

  return (
    <div className="lp-root lp-dash">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <AppNav />

      {hasAccess(profile) && profile && !profile.exam_date && !examDateDismissed && (
        <ExamDateBanner
          onSave={({ exam_date, exam_name }) => {
            setProfile(p => ({ ...p, exam_date, exam_name }))
            setExamDateDismissed(true)
          }}
          onDismiss={() => setExamDateDismissed(true)}
        />
      )}

      {hasAccess(profile) && profile?.exam_date && (
        <ExamCountdown
          profile={profile}
          totalQuestions={
            (profile?.diagnostic_track === 'gp' ? counts?.gp : counts?.specialist) ?? 0
          }
          totalAnswered={
            (profile?.diagnostic_track === 'gp' ? progGP?.answered : progSpecialist?.answered) ?? 0
          }
        />
      )}

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
        <ReadinessBadge accuracy={accuracy} totalAnswered={totalAnswered} />
        <h1 className="lp-dash__h1">
          Welcome back, <span className="lp-dash__h1-name">{firstName}</span>
        </h1>
        {subhead && <p className="lp-dash__sub">{subhead}</p>}
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

      {!hasAccess(profile) && profile !== null && (
        <UpgradePrompt navigate={navigate} />
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
            className="lp-mockx"
            onClick={() => navigate('/tutor')}
            role="button"
            tabIndex={0}
            aria-label="Open Dr. Tutor"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/tutor') } }}
          >
            <span className="lp-mockx__icon lp-mockx__icon--action"><IconChat /></span>
            <div className="lp-mockx__body">
              <h3 className="lp-mockx__title">Dr. Tutor</h3>
              <p className="lp-mockx__desc">Ask anything about your DOH exam</p>
            </div>
            <span className="lp-tutor-open" aria-hidden="true">
              Open Dr. Tutor <IconArrow size={13} />
            </span>
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
