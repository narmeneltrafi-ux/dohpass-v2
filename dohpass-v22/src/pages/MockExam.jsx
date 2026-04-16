import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase, getProfile, fetchSpecialistQuestions, fetchGPQuestions, saveProgress, primaryTopic } from '../lib/supabase'
import QuestionCard from '../components/QuestionCard'

const EXAM_QUESTIONS = 100
const EXAM_DURATION = 9000 // 150 minutes in seconds

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

function planBadge(profile) {
  if (!profile) return null
  const { plan, is_paid } = profile
  if (plan === 'all_access' || (is_paid && plan !== 'gp' && plan !== 'specialist'))
    return { label: 'All Access', cls: 'plan-badge--all' }
  if (plan === 'specialist') return { label: 'Specialist', cls: 'plan-badge--gold' }
  if (plan === 'gp') return { label: 'GP Plan', cls: 'plan-badge--blue' }
  return { label: 'Free', cls: 'plan-badge--free' }
}

/* ── Selection Phase ──────────────────────────────────────────── */
function SelectPhase({ onStart }) {
  return (
    <div className="me-select">
      <div className="me-select-card me-select-card--gold" onClick={() => onStart('specialist')}>
        <div className="me-select-icon">🏅</div>
        <h3 className="me-select-title">Specialist Exam</h3>
        <p className="me-select-desc">Internal Medicine — Cardiology, Respiratory, Nephrology & more</p>
        <div className="me-select-meta">
          <span>{EXAM_QUESTIONS} questions</span>
          <span>150 minutes</span>
        </div>
        <button className="btn-primary gold">Start Exam</button>
      </div>
      <div className="me-select-card me-select-card--blue" onClick={() => onStart('gp')}>
        <div className="me-select-icon">🩺</div>
        <h3 className="me-select-title">GP Exam</h3>
        <p className="me-select-desc">General Practice — broad primary care question bank</p>
        <div className="me-select-meta">
          <span>{EXAM_QUESTIONS} questions</span>
          <span>150 minutes</span>
        </div>
        <button className="btn-primary blue">Start Exam</button>
      </div>
    </div>
  )
}

/* ── Results Phase ────────────────────────────────────────────── */
function ExamResults({ answers, questions, track, onRestart, onHome }) {
  const correctCount = [...answers.values()].filter(a => a.isCorrect).length
  const total = answers.size
  const unanswered = EXAM_QUESTIONS - total
  const wrongCount = total - correctCount
  const pct = EXAM_QUESTIONS > 0 ? Math.round((correctCount / EXAM_QUESTIONS) * 100) : 0
  const passed = pct >= 60

  const accentVar = track === 'specialist' ? 'gold' : 'blue'

  // Topic breakdown
  const topicMap = {}
  answers.forEach((ans, idx) => {
    const q = questions[idx]
    if (!q) return
    const topic = primaryTopic(q.topic) || 'Unknown'
    if (!topicMap[topic]) topicMap[topic] = { topic, total: 0, correct: 0 }
    topicMap[topic].total++
    if (ans.isCorrect) topicMap[topic].correct++
  })
  const topicStats = Object.values(topicMap)
    .map(t => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy)

  function accuracyColor(v) {
    if (v >= 70) return 'var(--green)'
    if (v >= 50) return 'var(--gold)'
    return 'var(--red)'
  }

  return (
    <div className="me-results">
      <div className={`me-verdict ${passed ? 'me-verdict--pass' : 'me-verdict--fail'}`}>
        {passed ? 'PASSED' : 'FAILED'}
      </div>

      <div className="results-score">
        <span className={`score-pct ${accentVar}`}>{pct}%</span>
      </div>

      <div className="results-breakdown">
        <div className="breakdown-item">
          <span className="breakdown-num green">{correctCount}</span>
          <span className="breakdown-label">Correct</span>
        </div>
        <div className="breakdown-divider" />
        <div className="breakdown-item">
          <span className="breakdown-num red">{wrongCount}</span>
          <span className="breakdown-label">Wrong</span>
        </div>
        <div className="breakdown-divider" />
        <div className="breakdown-item">
          <span className="breakdown-num">{unanswered}</span>
          <span className="breakdown-label">Unanswered</span>
        </div>
      </div>

      {/* Topic breakdown */}
      <div className="an-card" style={{ marginTop: '2rem' }}>
        <h3 className="an-card-title">Topic Breakdown</h3>
        <div className="an-table-wrap">
          <table className="an-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Answered</th>
                <th>Correct</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {topicStats.map(t => (
                <tr key={t.topic}>
                  <td>{t.topic}</td>
                  <td>{t.total}</td>
                  <td>{t.correct}</td>
                  <td style={{ color: accuracyColor(t.accuracy), fontWeight: 700 }}>{t.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="me-results-actions">
        <button className={`btn-primary ${accentVar}`} onClick={onRestart}>Try Another Exam</button>
        <button className="me-results-home" onClick={onHome}>Back to Home</button>
      </div>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────── */
export default function MockExam() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [phase, setPhase] = useState('select') // select | exam | results
  const [examTrack, setExamTrack] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loadingExam, setLoadingExam] = useState(false)

  // Exam state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [answers, setAnswers] = useState(new Map())
  const [timeRemaining, setTimeRemaining] = useState(EXAM_DURATION)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

  // Warn before leaving during exam
  useEffect(() => {
    if (phase !== 'exam') return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  // Timer
  useEffect(() => {
    if (phase !== 'exam') return
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, EXAM_DURATION - elapsed)
      setTimeRemaining(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        finishExam()
      }
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  async function startExam(track) {
    setLoadingExam(true)
    setExamTrack(track)
    try {
      const fetcher = track === 'specialist' ? fetchSpecialistQuestions : fetchGPQuestions
      const allQuestions = await fetcher(null)
      const examQuestions = shuffle(allQuestions).slice(0, EXAM_QUESTIONS)
      setQuestions(examQuestions)
      setCurrentIndex(0)
      setSelected(null)
      setSubmitted(false)
      setFeedback(null)
      setCorrect(0)
      setWrong(0)
      setAnswers(new Map())
      setTimeRemaining(EXAM_DURATION)
      setPhase('exam')
    } catch {
      alert('Failed to load questions. Please try again.')
    }
    setLoadingExam(false)
  }

  function finishExam() {
    clearInterval(timerRef.current)
    setPhase('results')
  }

  function handleSelect(i) {
    if (!submitted) setSelected(i)
  }

  function handleSubmit() {
    if (selected === null) return
    const q = questions[currentIndex]
    const correctIdx = (() => {
      if (!q.answer) return -1
      const prefixMatch = q.options.findIndex(opt =>
        opt.trim().toUpperCase().startsWith(q.answer.trim().toUpperCase() + '.')
      )
      if (prefixMatch !== -1) return prefixMatch
      return q.answer.trim().toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0)
    })()

    const isCorrect = selected === correctIdx
    if (isCorrect) setCorrect(c => c + 1)
    else setWrong(w => w + 1)

    setFeedback({
      correct: isCorrect,
      msg: isCorrect ? 'Correct!' : `Incorrect — the answer is ${q.answer}.`,
    })
    setSubmitted(true)

    setAnswers(prev => {
      const next = new Map(prev)
      next.set(currentIndex, { selectedOption: selected, isCorrect, questionId: q.id })
      return next
    })

    saveProgress(examTrack, q.id, isCorrect)
  }

  function handleNext() {
    if (currentIndex + 1 >= EXAM_QUESTIONS) {
      finishExam()
      return
    }
    setCurrentIndex(i => i + 1)
    setSelected(null)
    setSubmitted(false)
    setFeedback(null)
  }

  const badge = planBadge(profile)
  const accentVar = examTrack === 'specialist' ? 'gold' : 'blue'

  const timerClass = timeRemaining <= 300
    ? 'me-timer me-timer--danger'
    : timeRemaining <= 600
      ? 'me-timer me-timer--warning'
      : 'me-timer'

  return (
    <div className="me">
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />

      {/* Nav */}
      <nav className="hw-nav">
        <div className="hw-nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="hw-nav-cross"><IconCross /></span>
          <span className="hw-nav-brand">DOH<span>Pass</span></span>
        </div>
        <div className="hw-nav-right">
          {badge && <span className={`plan-badge ${badge.cls}`}>{badge.label}</span>}
          {phase === 'exam' && (
            <span className={timerClass}>{formatTime(timeRemaining)}</span>
          )}
          {phase !== 'exam' && (
            <button className="pr-back" onClick={() => navigate('/')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Home
            </button>
          )}
        </div>
      </nav>

      <div className="me-page">
        {phase === 'select' && (
          <>
            <h1 className="me-title">Mock Exam</h1>
            <p className="me-sub">Simulate the real DOH exam. {EXAM_QUESTIONS} questions, {EXAM_DURATION / 60} minutes, pass mark 60%.</p>
            {loadingExam ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <SelectPhase onStart={startExam} />
            )}
          </>
        )}

        {phase === 'exam' && questions[currentIndex] && (
          <div className="quiz-page">
            <QuestionCard
              question={questions[currentIndex]}
              index={currentIndex}
              total={EXAM_QUESTIONS}
              correct={correct}
              wrong={wrong}
              selectedOption={selected}
              submitted={submitted}
              onSelect={handleSelect}
              onSubmit={handleSubmit}
              onNext={handleNext}
              feedback={feedback}
              track={accentVar}
            />
          </div>
        )}

        {phase === 'results' && (
          <ExamResults
            answers={answers}
            questions={questions}
            track={examTrack}
            onRestart={() => setPhase('select')}
            onHome={() => navigate('/')}
          />
        )}
      </div>
    </div>
  )
}
