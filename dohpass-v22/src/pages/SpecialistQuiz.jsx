import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSpecialistQuestions, fetchSpecialistTopics, saveProgress } from '../lib/supabase'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

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
    } catch (e) {
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

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
        <button className="nav-cta ghost" onClick={() => navigate('/')}>All Tracks</button>
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
        )}

        {!loading && !error && bank.length === 0 && (
          <div className="loading">No questions found for this topic.</div>
        )}
      </div>
    </>
  )
}
