import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchDiagnosticQuestions,
  completeDiagnostic,
  saveProgress,
  getProfile,
  hasAccess,
  primaryTopic,
} from '../lib/supabase'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
import QuestionCard from '../components/QuestionCard'

const TOTAL = 20

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/* ── Icons ────────────────────────────────────────────────────── */
const IconArrow = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)
const IconStethoscope = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3v6a4 4 0 0 0 8 0V3" />
    <path d="M5 3H3M13 3h2" />
    <path d="M9 13v2a5 5 0 0 0 5 5 5 5 0 0 0 5-5v-1" />
    <circle cx="19" cy="11" r="2" />
  </svg>
)
const IconHeartPulse = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 12h3.5l2-4 4 8 2-4h5.5" />
    <path d="M21 12.5a5 5 0 0 0-9-3 5 5 0 0 0-9 3 5 5 0 0 0 1.5 3.5L12 21l7.5-5a5 5 0 0 0 1.5-3.5z" opacity=".25" />
  </svg>
)
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconWarning = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

/* ── Setup phase ─────────────────────────────────────────────── */
function SetupPhase({ onStart, onSkip }) {
  const [track, setTrack] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleBegin() {
    if (!track || loading) return
    setLoading(true)
    await onStart(track)
    setLoading(false)
  }

  return (
    <div className="diag-page">
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      <div className="diag-setup-card">
        <div className="diag-brand">
          <div className="diag-brand-icon"><IconCross /></div>
          <span className="diag-brand-name">DOH<span>Pass</span></span>
        </div>

        <div className="diag-setup-header">
          <h1 className="diag-setup-title">Exam Readiness Check</h1>
          <p className="diag-setup-sub">
            20 questions · 10 high-yield topics · ~10 minutes
          </p>
          <p className="diag-setup-desc">
            Answer honestly — no feedback shown during the assessment. Your results
            will reveal exactly where to focus so every study session counts.
          </p>
        </div>

        <div className="diag-track-grid">
          <button
            type="button"
            className={`diag-track-btn${track === 'specialist' ? ' diag-track-btn--active gold' : ''}`}
            onClick={() => setTrack('specialist')}
          >
            <span className="diag-track-btn__icon"><IconStethoscope /></span>
            <span className="diag-track-btn__label">Specialist</span>
            <span className="diag-track-btn__sub">Internal Medicine</span>
          </button>
          <button
            type="button"
            className={`diag-track-btn${track === 'gp' ? ' diag-track-btn--active blue' : ''}`}
            onClick={() => setTrack('gp')}
          >
            <span className="diag-track-btn__icon"><IconHeartPulse /></span>
            <span className="diag-track-btn__label">GP</span>
            <span className="diag-track-btn__sub">General Practice</span>
          </button>
        </div>

        <button
          type="button"
          className="diag-begin-btn"
          onClick={handleBegin}
          disabled={!track || loading}
        >
          {loading ? 'Loading questions…' : <>Begin Assessment <IconArrow size={16} /></>}
        </button>

        <button type="button" className="diag-skip" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  )
}

/* ── Results phase ───────────────────────────────────────────── */
function ResultsPhase({ questions, answers, track, profile }) {
  const navigate = useNavigate()
  const correct = answers.filter(a => a.isCorrect).length
  const total = answers.length
  const pct = Math.round((correct / total) * 100)
  const isPaid = hasAccess(profile)

  // Per-topic stats
  const topicStats = {}
  questions.forEach((q, i) => {
    const topic = primaryTopic(q.topic) || q.topic || 'General'
    if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 }
    topicStats[topic].total++
    if (answers[i]?.isCorrect) topicStats[topic].correct++
  })

  const topicList = Object.entries(topicStats)
    .map(([topic, s]) => ({ topic, ...s, pct: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.pct - b.pct)

  const gaps = topicList.filter(t => t.pct < 60)
  const strengths = topicList.filter(t => t.pct === 100)

  let readiness
  if (pct < 40) {
    readiness = 'Your score indicates significant preparation gaps across multiple high-yield areas. Targeted daily practice is needed before your exam.'
  } else if (pct < 60) {
    readiness = 'You have a foundation, but several critical topics fall below the pass threshold. Consistent targeted practice will close these gaps.'
  } else if (pct < 75) {
    readiness = 'Solid performance. Your weak areas are identifiable and addressable — focused practice on these topics could meaningfully increase your pass probability.'
  } else {
    readiness = 'Strong baseline. Reinforcing your weak topics with spaced repetition and targeted drills could push your score to distinction level.'
  }

  const weakestTopic = gaps[0]?.topic ?? null

  function handleCTA() {
    if (isPaid) {
      navigate(weakestTopic ? `/${track}` : '/dashboard')
    } else {
      navigate('/pricing')
    }
  }

  function scoreColor() {
    if (pct >= 70) return 'var(--green, #22c55e)'
    if (pct >= 50) return 'var(--gold, #c9a227)'
    return 'var(--red, #ef4444)'
  }

  return (
    <div className="diag-page">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />

      <div className="diag-results-card">
        <div className="diag-brand">
          <div className="diag-brand-icon"><IconCross /></div>
          <span className="diag-brand-name">DOH<span>Pass</span></span>
        </div>

        <div className="diag-results-header">
          <div className="diag-results-eyebrow">
            {track === 'specialist' ? 'Specialist Track' : 'GP Track'} · Readiness Assessment
          </div>
          <h1 className="diag-results-title">Your Results</h1>
        </div>

        {/* Score card */}
        <div className="diag-score-card">
          <div className="diag-score-num" style={{ color: scoreColor() }}>
            {pct}%
          </div>
          <div className="diag-score-label">
            {correct} of {total} correct
          </div>
        </div>

        <p className="diag-readiness-stmt">{readiness}</p>

        {/* Topic breakdown */}
        <div className="diag-section">
          <h2 className="diag-section-title">Topic Breakdown</h2>
          <div className="diag-topic-list">
            {topicList.map(({ topic, correct: c, total: t, pct: p }) => (
              <div key={topic} className="diag-topic-row">
                <div className="diag-topic-row__head">
                  <span className="diag-topic-row__icon">
                    {p === 100 ? <span className="diag-icon-ok"><IconCheck /></span>
                      : p < 60 ? <span className="diag-icon-warn"><IconWarning /></span>
                      : <span className="diag-icon-mid">·</span>}
                  </span>
                  <span className="diag-topic-row__name">{topic}</span>
                  <span className="diag-topic-row__score">{c}/{t}</span>
                  <span className="diag-topic-row__pct">{p}%</span>
                </div>
                <div className="diag-topic-bar">
                  <div
                    className="diag-topic-bar__fill"
                    style={{
                      width: `${p}%`,
                      background: p === 100 ? 'var(--green, #22c55e)'
                        : p < 60 ? 'var(--red, #ef4444)'
                        : 'var(--gold, #c9a227)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gaps */}
        {gaps.length > 0 && (
          <div className="diag-section diag-gaps-section">
            <h2 className="diag-section-title diag-section-title--warn">
              Critical Gaps
            </h2>
            <p className="diag-gaps-body">
              These topics scored below the pass threshold and directly affect your exam result.
            </p>
            <ul className="diag-gaps-list">
              {gaps.map(({ topic, pct: p }) => (
                <li key={topic} className="diag-gaps-item">
                  <span className="diag-gaps-item__topic">{topic}</span>
                  <span className="diag-gaps-item__pct">{p}% accuracy</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="diag-cta-block">
          {!isPaid && (
            <p className="diag-cta-pitch">
              DOHPass targets these exact gaps with adaptive practice and spaced-repetition flashcards — built specifically for the DOH exam blueprint.
            </p>
          )}
          <button type="button" className="diag-cta-btn btn-primary gold" onClick={handleCTA}>
            {isPaid
              ? (weakestTopic ? `Practice ${weakestTopic} now` : 'Go to dashboard')
              : 'Fix your gaps — See plans'}
            <IconArrow size={16} />
          </button>
          {isPaid && (
            <button type="button" className="diag-skip" onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </button>
          )}
          {!isPaid && (
            <button type="button" className="diag-skip" onClick={() => navigate('/dashboard')}>
              Already subscribed? Go to dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main diagnostic page ────────────────────────────────────── */
export default function Diagnostic() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('setup')   // 'setup' | 'running' | 'results'
  const [track, setTrack] = useState(null)
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [answers, setAnswers] = useState([])    // [{isCorrect, selectedIdx}]
  const [elapsed, setElapsed] = useState(0)
  const [profile, setProfile] = useState(null)
  const timerRef = useRef(null)
  const questionStartedAt = useRef(null)

  useEffect(() => {
    let cancelled = false
    getProfile().then(p => { if (!cancelled) setProfile(p) })
    return () => { cancelled = true }
  }, [])

  // Elapsed timer — only runs during 'running' phase
  useEffect(() => {
    if (phase !== 'running') return
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  async function handleStart(selectedTrack) {
    const qs = await fetchDiagnosticQuestions(selectedTrack)
    setTrack(selectedTrack)
    setQuestions(qs)
    setCurrentIndex(0)
    setSelected(null)
    setSubmitted(false)
    setAnswers([])
    setElapsed(0)
    questionStartedAt.current = Date.now()
    setPhase('running')
  }

  const handleSubmit = useCallback(() => {
    if (selected === null || submitted) return
    const q = questions[currentIndex]
    const correctIdx = resolveCorrectIndex(q.options, q.answer)
    const isCorrect = correctIdx !== -1 && selected === correctIdx
    const responseTimeMs = questionStartedAt.current
      ? Math.round(Date.now() - questionStartedAt.current)
      : null

    setSubmitted(true)
    setAnswers(prev => [...prev, { isCorrect, selectedIdx: selected }])

    saveProgress(
      track, q.id, isCorrect, q.topic,
      String.fromCharCode(65 + selected), q.answer,
      responseTimeMs
    )
  }, [selected, submitted, questions, currentIndex, track])

  const handleNext = useCallback(async () => {
    const isLast = currentIndex + 1 >= questions.length
    if (isLast) {
      clearInterval(timerRef.current)
      // Mark diagnostic complete on profile (fire-and-forget)
      completeDiagnostic(track)
      setPhase('results')
      return
    }
    setCurrentIndex(i => i + 1)
    questionStartedAt.current = Date.now()
    setSelected(null)
    setSubmitted(false)
  }, [currentIndex, questions.length, track])

  if (phase === 'setup') {
    return (
      <SetupPhase
        onStart={handleStart}
        onSkip={() => navigate('/dashboard')}
      />
    )
  }

  if (phase === 'results') {
    return (
      <ResultsPhase
        questions={questions}
        answers={answers}
        track={track}
        profile={profile}
      />
    )
  }

  // Running phase
  const q = questions[currentIndex] ?? null
  const accentTrack = track === 'specialist' ? 'gold' : 'blue'

  return (
    <div className="diag-running-wrap">
      {/* Elapsed timer strip */}
      <div className="diag-timer-strip">
        <span className="diag-timer-strip__label">Readiness Check</span>
        <span className="diag-timer-strip__time">{formatElapsed(elapsed)}</span>
        <span className="diag-timer-strip__count">{currentIndex + 1} / {questions.length}</span>
      </div>

      <QuestionCard
        question={q}
        index={currentIndex}
        total={questions.length}
        selectedOption={selected}
        submitted={submitted}
        onSelect={setSelected}
        onSubmit={handleSubmit}
        onNext={handleNext}
        feedback={null}
        track={accentTrack}
        mode="diagnostic"
        backPath="/dashboard"
        backLabel="Dashboard"
      />
    </div>
  )
}
