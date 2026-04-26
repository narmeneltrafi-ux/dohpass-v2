import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSpecialistQuestions, fetchSpecialistTopics, saveProgress, getProfile } from '../lib/supabase'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'
import { BookmarkButton } from '../components/BookmarkButton'
import { useBookmarks } from '../hooks/useBookmarks'

const FREE_LIMIT = 10
const SESSION_KEY = 'dohpass_free_specialist'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

function PaywallGate() {
  const navigate = useNavigate()
  return (
    <div className="paywall-wrap">
      <div className="paywall-card">
        <div className="paywall-icon">🔒</div>
        <h2 className="paywall-title">Free limit reached</h2>
        <p className="paywall-body">
          You've answered {FREE_LIMIT} free questions this session.<br />
          Upgrade for unlimited access to all questions.
        </p>
        <button className="btn-primary gold paywall-cta" onClick={() => navigate('/pricing')}>
          Upgrade to Unlimited
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
    // TODO: backfill progress rows written during the
    // handleSubmit/QuestionCard disagreement window — see [issue link].
    await saveProgress('specialist', q.id, isCorrect, q.topic, String.fromCharCode(65 + selected), q.answer)

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

  return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="quiz-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
          <div className="quiz-title gold">Internal Medicine Specialist</div>
        </div>

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

        {loading && <div className="loading"><div className="spinner" />Loading questions...</div>}
        {error && <div className="loading error">{error}</div>}

        {!loading && !error && done && (
          <ResultsScreen correct={correct} wrong={wrong} track="gold" onRestart={handleRestart} />
        )}

        {!loading && !error && !done && bank.length > 0 && (
          hitLimit
            ? <PaywallGate />
            : (
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
            )
        )}

        {!loading && !error && bank.length === 0 && (
          <div className="loading">No questions found for this topic.</div>
        )}
      </div>
  )
}
