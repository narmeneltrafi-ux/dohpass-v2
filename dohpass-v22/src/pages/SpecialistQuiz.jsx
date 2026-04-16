import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSpecialistQuestions, fetchSpecialistTopics, saveProgress, getProfile } from '../lib/supabase'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'

const FREE_LIMIT = 10
const SESSION_KEY = 'dohpass_free_specialist'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

function PaywallGate() {
  return (
    <div className="paywall-wrap">
      <div className="paywall-card">
        <div className="paywall-icon">🔒</div>
        <h2 className="paywall-title">Free limit reached</h2>
        <p className="paywall-body">
          You've answered {FREE_LIMIT} free questions this session.<br />
          Upgrade for unlimited access to all questions.
        </p>
        <button className="btn-primary gold paywall-cta" disabled>
          Upgrade to Unlimited — Coming Soon
        </button>
      </div>
    </div>
  )
}

export default function SpecialistQuiz() {
  const navigate = useNavigate()
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
  const [sessionCount, setSessionCount] = useState(
    () => parseInt(sessionStorage.getItem(SESSION_KEY) || '0', 10)
  )

  useEffect(() => {
    getProfile().then(p => {
      setIsPaid(p?.is_paid === true)
      setPlan(p?.plan ?? 'free')
    })
  }, [])

  useEffect(() => {
    fetchSpecialistTopics().then(setTopics).catch(console.error)
  }, [])

  const loadQuestions = useCallback(async (topic) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSpecialistQuestions(topic === 'All' ? null : topic)
      setBank(shuffle(data))
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
    } catch {
      setError('Failed to load questions. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadQuestions(activeTopic) }, [activeTopic, loadQuestions])

  function handleSelect(i) { if (!submitted) setSelected(i) }

  async function handleSubmit() {
    if (selected === null) return
    setSubmitted(true)
    const q = bank[index]
    const correctIdx = q.options.findIndex(opt =>
      opt.trim().toUpperCase().startsWith(q.answer.trim().toUpperCase() + '.')
    )
    const isCorrect = selected === correctIdx
    if (isCorrect) {
      setCorrect(c => c + 1)
      setFeedback({ correct: true, msg: 'Correct ✓' })
    } else {
      setWrong(w => w + 1)
      setFeedback({ correct: false, msg: `Incorrect — Answer: ${q.answer}` })
    }
    await saveProgress('specialist', q.id, isCorrect)

    const newCount = sessionCount + 1
    setSessionCount(newCount)
    sessionStorage.setItem(SESSION_KEY, newCount)
  }

  function handleNext() {
    if (index + 1 >= bank.length) { setDone(true); return }
    setIndex(i => i + 1)
    setSelected(null); setSubmitted(false); setFeedback(null)
  }

  function handleRestart() {
    setBank(b => shuffle(b))
    setIndex(0); setCorrect(0); setWrong(0)
    setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
  }

  const hitLimit = isPaid === false && sessionCount >= FREE_LIMIT

  const planLabel = plan === 'all_access' ? 'All Access'
    : plan === 'specialist' ? 'Specialist'
    : plan === 'gp' ? 'GP Plan'
    : 'Free'
  const planCls = plan === 'all_access' ? 'plan-badge--all'
    : plan === 'specialist' ? 'plan-badge--gold'
    : plan === 'gp' ? 'plan-badge--blue'
    : 'plan-badge--free'

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
        <div className="nav-right">
          {plan !== null && (
            <span className={`plan-badge ${planCls}`}>{planLabel}</span>
          )}
          <button className="nav-cta ghost" onClick={() => navigate('/')}>All Tracks</button>
        </div>
      </nav>

      <div className="quiz-page">
        <div className="quiz-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
          <div className="quiz-title gold">Internal Medicine Specialist</div>
        </div>

        <div className="topics">
          {topics.map(t => (
            <button
              key={t}
              className={`topic-btn${activeTopic === t ? ' active' : ''}`}
              onClick={() => setActiveTopic(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && <div className="loading"><div className="spinner" />Loading questions...</div>}
        {error && <div className="loading error">{error}</div>}

        {!loading && !error && done && (
          <ResultsScreen correct={correct} wrong={wrong} track="gold" onRestart={handleRestart} />
        )}

        {!loading && !error && !done && bank.length > 0 && (
          hitLimit
            ? <PaywallGate />
            : <QuestionCard
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
        )}

        {!loading && !error && bank.length === 0 && (
          <div className="loading">No questions found for this topic.</div>
        )}
      </div>
    </>
  )
}
