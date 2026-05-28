import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { fetchQuestionIdList, fetchQuestionsByIds, saveProgress, primaryTopic } from '../lib/supabase'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
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

function letterFor(i) { return String.fromCharCode(65 + i) }

const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)
const IconArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

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

/* ── Review Phase — wrong-answer walk-through ─────────────────── */
function ReviewPhase({ wrongEntries, track, onDone }) {
  const [idx, setIdx] = useState(0)
  const total = wrongEntries.length
  const entry = wrongEntries[idx]
  const q = entry?.question
  const options = q?.options || []
  const correctIdx = q ? resolveCorrectIndex(options, q.answer) : -1
  const userIdx = entry?.selectedOption ?? -1
  const accentClass = track === 'specialist' ? 'qui-gold' : 'qui-blue'
  const pct = total > 0 ? ((idx + 1) / total) * 100 : 0

  function advance() {
    if (idx + 1 < total) setIdx(i => i + 1)
    else onDone()
  }

  if (!q) return null

  return (
    <div className={`qui-page ${accentClass}`}>
      <div className="qui-stickyhead">
        <div
          className="qui-progress"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Review progress"
        >
          <div className="qui-progress__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="qui-topbar">
          <button className="qui-back" onClick={onDone} type="button" aria-label="Back to results">
            <IconArrowLeft />
            <span className="qui-back__label">Results</span>
          </button>
          <div className="qui-counter" aria-live="polite">
            Review {idx + 1} of {total}
          </div>
          <div className="qui-modepill">REVIEW</div>
        </div>
      </div>

      <div className="qui-body">
        <div className="qui-meta">
          <div className="qui-meta__tags">
            {q.topic && (
              <span className="qui-meta__tag">{String(primaryTopic(q.topic)).toUpperCase()}</span>
            )}
            {q.difficulty && (
              <>
                <span className="qui-meta__sep" aria-hidden="true">·</span>
                <span className="qui-meta__tag">{String(q.difficulty).toUpperCase()}</span>
              </>
            )}
          </div>
        </div>

        <p className="qui-stem">{q.q}</p>

        <div className="qui-options" role="list" aria-label="Answer options">
          {options.map((opt, i) => {
            const isCorrect = i === correctIdx
            const isUser = i === userIdx && i !== correctIdx
            const state = isCorrect ? 'correct' : isUser ? 'incorrect' : 'idle'
            return (
              <div
                key={i}
                className={`qui-opt qui-opt--${state}`}
                style={{ cursor: 'default' }}
                role="listitem"
              >
                <span className="qui-opt__letter" aria-hidden="true">{letterFor(i)}</span>
                <span className="qui-opt__text">{opt}</span>
                {isCorrect && (
                  <span className="qui-opt__icon qui-opt__icon--ok" aria-label="Correct answer">
                    <IconCheck />
                  </span>
                )}
                {isUser && (
                  <span className="qui-opt__icon qui-opt__icon--bad" aria-label="Your incorrect answer">
                    <IconX />
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Explanation */}
        <div className="qui-expl qui-expl--bad" style={{ animation: 'none' }}>
          <div className="qui-expl__head">
            <span className="qui-expl__pill qui-expl__pill--ok">
              Correct answer: {q.answer}
            </span>
            {q.source && <span className="qui-expl__source">{q.source}</span>}
          </div>
          {q.explanation && (
            <p className="qui-expl__body">{q.explanation}</p>
          )}
        </div>

        {/* CTA */}
        <div className="qui-actions">
          <button type="button" className="qui-cta qui-cta--gold" onClick={advance}>
            {idx + 1 < total ? 'Next Wrong Answer' : 'Back to Results'} <IconArrowRight />
          </button>
        </div>

        <div className="qui-hint" aria-hidden="true">→ for next</div>
      </div>
    </div>
  )
}

/* ── Results Phase ────────────────────────────────────────────── */
function ExamResults({ answers, questions, track, onRestart, onDashboard, onReview }) {
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
        {wrongCount > 0 && (
          <button className={`btn-primary ${accentVar}`} onClick={onReview}>
            Review {wrongCount} Wrong {wrongCount === 1 ? 'Answer' : 'Answers'}
          </button>
        )}
        <button className={`btn-primary ${accentVar}`} onClick={onRestart}>Try Another Exam</button>
        <button className="me-results-home" onClick={onDashboard}>Back to Dashboard</button>
      </div>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────── */
export default function MockExam() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('select') // select | exam | results | review
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
  const questionStartedAt = useRef(null)

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
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function startExam(track) {
    setLoadingExam(true)
    setExamTrack(track)
    try {
      // Stage 1: fetch lightweight id+topic list, shuffle, pick 100 ids
      const idList = await fetchQuestionIdList(track)
      const selectedIds = shuffle(idList).slice(0, EXAM_QUESTIONS).map(r => r.id)
      // Stage 2: fetch full content for only those 100 questions
      const fetched = await fetchQuestionsByIds(track, selectedIds)
      // Preserve the shuffled order from stage 1
      const idOrder = new Map(selectedIds.map((id, i) => [id, i]))
      const examQuestions = fetched.slice().sort((a, b) => idOrder.get(a.id) - idOrder.get(b.id))
      setQuestions(examQuestions)
      setCurrentIndex(0)
      setSelected(null)
      setSubmitted(false)
      setFeedback(null)
      setCorrect(0)
      setWrong(0)
      setAnswers(new Map())
      setTimeRemaining(EXAM_DURATION)
      questionStartedAt.current = Date.now()
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
    const correctIdx = resolveCorrectIndex(q.options, q.answer)
    const isCorrect = selected === correctIdx
    const responseTimeMs = questionStartedAt.current
      ? Math.round(Date.now() - questionStartedAt.current)
      : null
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

    saveProgress(examTrack, q.id, isCorrect, q.topic, String.fromCharCode(65 + selected), q.answer, responseTimeMs)
  }

  function handleNext() {
    if (currentIndex + 1 >= EXAM_QUESTIONS) {
      finishExam()
      return
    }
    setCurrentIndex(i => i + 1)
    questionStartedAt.current = Date.now()
    setSelected(null)
    setSubmitted(false)
    setFeedback(null)
  }

  // Build the wrong-answer entries for the review phase
  const wrongEntries = [...answers.entries()]
    .filter(([, ans]) => !ans.isCorrect)
    .map(([idx, ans]) => ({
      question: questions[idx],
      selectedOption: ans.selectedOption,
    }))
    .filter(e => e.question != null)

  const accentVar = examTrack === 'specialist' ? 'gold' : 'blue'

  const timerClass = timeRemaining <= 300
    ? 'me-timer me-timer--danger'
    : timeRemaining <= 600
      ? 'me-timer me-timer--warning'
      : 'me-timer'

  // Review phase fills the viewport like QuestionCard — skip wrapper chrome
  if (phase === 'review') {
    return (
      <ReviewPhase
        wrongEntries={wrongEntries}
        track={examTrack}
        onDone={() => setPhase('results')}
      />
    )
  }

  return (
    <div className="me" style={{ paddingTop: '62px' }}>
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />

      {/* Exam timer bar (only during active exam) */}
      {phase === 'exam' && (
        <div className="me-timer-bar">
          <span className={timerClass}>{formatTime(timeRemaining)}</span>
        </div>
      )}

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
              mode="timed"
              isPaid={true}
            />
          </div>
        )}

        {phase === 'results' && (
          <ExamResults
            answers={answers}
            questions={questions}
            track={examTrack}
            onRestart={() => setPhase('select')}
            onDashboard={() => navigate('/dashboard')}
            onReview={() => setPhase('review')}
          />
        )}
      </div>
    </div>
  )
}
