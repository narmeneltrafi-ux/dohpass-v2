import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSpecialistQuestions,
  fetchSpecialistTopics,
  saveProgress,
  getProfile,
  hasAccess,
  fetchTrialQuestions,
  fetchTrialStatus,
} from '../lib/supabase'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'
import { BookmarkButton } from '../components/BookmarkButton'
import { useBookmarks } from '../hooks/useBookmarks'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

function PaywallGate({ title, body, ctaLabel }) {
  const navigate = useNavigate()
  return (
    <div className="paywall-wrap">
      <div className="paywall-card">
        <div className="paywall-icon">🔒</div>
        <h2 className="paywall-title">{title}</h2>
        <p className="paywall-body">{body}</p>
        <button className="btn-primary gold paywall-cta" onClick={() => navigate('/pricing')}>
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

export default function SpecialistQuiz() {
  const navigate = useNavigate()
  const { bookmarks, toggle } = useBookmarks('specialist')
  const [topics, setTopics] = useState(['All'])
  const [activeTopic, setActiveTopic] = useState('All')
  const [bank, setBank] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [done, setDone] = useState(false)

  // null = loading, true = paid, false = free
  const [isPaid, setIsPaid] = useState(null)
  const [plan, setPlan] = useState(null)
  const [trialStatus, setTrialStatus] = useState(null) // { used, limit, remaining }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const p = await getProfile()
      if (cancelled) return
      const paid = hasAccess(p)
      setIsPaid(paid)
      setPlan(p?.plan ?? 'free')
      if (!paid) {
        const status = await fetchTrialStatus()
        if (!cancelled) setTrialStatus(status)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const planAllowed = isPaid === true && (plan === 'specialist' || plan === 'all_access')
  const trialActive = isPaid === false && trialStatus !== null && trialStatus.remaining > 0
  const trialExhausted = isPaid === false && trialStatus !== null && trialStatus.remaining === 0
  const wrongPlan = isPaid === true && plan !== 'specialist' && plan !== 'all_access'

  useEffect(() => {
    if (!planAllowed) return
    fetchSpecialistTopics().then(setTopics).catch(console.error)
  }, [planAllowed])

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let data = []
      if (planAllowed) {
        data = await fetchSpecialistQuestions(activeTopic === 'All' ? null : activeTopic)
      } else if (trialActive) {
        data = await fetchTrialQuestions('specialist')
      }
      setBank(shuffle(data))
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
    } catch {
      setError('Failed to load questions. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [planAllowed, trialActive, activeTopic])

  useEffect(() => {
    if (isPaid === null) return
    if (isPaid === false && trialStatus === null) return
    if (planAllowed || trialActive) loadQuestions()
    else setLoading(false)
  }, [isPaid, trialStatus, planAllowed, trialActive, loadQuestions])

  function handleSelect(i) { if (!submitted) setSelected(i) }

  async function handleSubmit() {
    if (selected === null) return
    const q = bank[index]
    const correctIdx = resolveCorrectIndex(q.options, q.answer)
    if (correctIdx === -1) {
      console.error('Unresolvable answer for question', q.id, q.answer)
      setSubmitted(true)
      setFeedback({
        correct: false,
        dataIssue: true,
        msg: 'This question has a data issue on our end — skipping it. Thanks for your patience.',
      })
      return
    }
    setSubmitted(true)
    const isCorrect = selected === correctIdx
    if (isCorrect) {
      setCorrect(c => c + 1)
      setFeedback({ correct: true, msg: 'Correct ✓' })
    } else {
      setWrong(w => w + 1)
      setFeedback({ correct: false, msg: `Incorrect — Answer: ${q.answer}` })
    }
    await saveProgress('specialist', q.id, isCorrect, q.topic, String.fromCharCode(65 + selected), q.answer)
  }

  function handleNext() {
    if (index + 1 >= bank.length) { setDone(true); return }
    setIndex(i => i + 1)
    setSelected(null); setSubmitted(false); setFeedback(null)
  }

  async function handleRestart() {
    if (isPaid && plan && (plan === 'specialist' || plan === 'all_access')) {
      // Paid user: reshuffle existing bank
      setBank(b => shuffle(b))
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
      return
    }
    // Free user: refetch trial status + questions
    const status = await fetchTrialStatus()
    setTrialStatus(status)
    if (status.remaining === 0) {
      // Component will re-render to PaywallGate based on trialStatus state
      setDone(false)
      return
    }
    const data = await fetchTrialQuestions('specialist')
    setBank(shuffle(data))
    setIndex(0); setCorrect(0); setWrong(0)
    setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
  }

  if (wrongPlan) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="quiz-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
          <div className="quiz-title gold">Internal Medicine Specialist</div>
        </div>
        <PaywallGate
          title="Wrong Plan"
          body="This track requires the Specialist plan or All Access."
          ctaLabel="Upgrade Plan"
        />
      </div>
    )
  }

  if (trialExhausted) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="quiz-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
          <div className="quiz-title gold">Internal Medicine Specialist</div>
        </div>
        <PaywallGate
          title="Trial used up"
          body="You've used all 30 free questions. Upgrade to continue practicing."
          ctaLabel="Upgrade to Unlimited"
        />
      </div>
    )
  }

  return (
    <div className="quiz-page" style={{ paddingTop: '62px' }}>
      <div className="quiz-header">
        <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
        <div className="quiz-title gold">Internal Medicine Specialist</div>
      </div>

      {trialActive && (
        <div
          className="trial-banner"
          style={{
            maxWidth: '720px',
            margin: '0 auto 12px',
            padding: '12px 16px',
            textAlign: 'center',
            background: 'rgba(212, 175, 55, 0.1)',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            borderRadius: '8px',
            color: '#d4af37',
            fontWeight: 500,
          }}
        >
          Free trial: {trialStatus.remaining} of {trialStatus.limit} questions left
        </div>
      )}

      {planAllowed && (
        <div className="filter-pills-scroll">
          <div className="filter-pills">
            {topics.map(t => (
              <button
                key={t}
                className={`filter-pill${activeTopic === t ? ' filter-pill--active' : ''} filter-pill--gold`}
                onClick={() => setActiveTopic(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="loading"><div className="spinner" />Loading questions...</div>}
      {error && <div className="loading error">{error}</div>}

      {!loading && !error && done && (
        <ResultsScreen correct={correct} wrong={wrong} track="gold" onRestart={handleRestart} />
      )}

      {!loading && !error && !done && bank.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', maxWidth: '720px', margin: '0 auto', padding: '0 16px' }}>
            <BookmarkButton
              questionId={bank[index].id}
              topic={bank[index].topic}
              bookmarks={bookmarks}
              toggle={toggle}
            />
          </div>
          <QuestionCard
            question={bank[index]}
            index={index}
            total={bank.length}
            correct={correct}
            wrong={wrong}
            selectedOption={selected}
            submitted={submitted}
            onSelect={handleSelect}
            onSubmit={handleSubmit}
            onNext={handleNext}
            feedback={feedback}
            track="gold"
          />
        </>
      )}

      {!loading && !error && bank.length === 0 && (
        <div className="loading">No questions found for this topic.</div>
      )}
    </div>
  )
}
