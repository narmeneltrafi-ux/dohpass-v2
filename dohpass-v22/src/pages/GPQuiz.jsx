import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchGPQuestions, fetchGPSystems, fetchGPQuestionsBySystem } from '../lib/supabase'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

export default function GPQuiz() {
  const navigate = useNavigate()
  const [systemMap, setSystemMap] = useState({})
  const [activeSystem, setActiveSystem] = useState('All')
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
    fetchGPSystems().then(setSystemMap).catch(console.error)
  }, [])

  const systems = ['All', ...Object.keys(systemMap)]
  const topics = activeSystem === 'All' ? [] : (systemMap[activeSystem] || [])

  const loadQuestions = useCallback(async (system, topic) => {
    setLoading(true)
    setError(null)
    try {
      let data
      if (system === 'All') {
        data = await fetchGPQuestions(null)
      } else if (topic === 'All') {
        data = await fetchGPQuestionsBySystem(system)
      } else {
        data = await fetchGPQuestions(topic)
      }
      setBank(shuffle(data))
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
    } catch (e) {
      setError('Failed to load questions. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadQuestions(activeSystem, activeTopic) }, [activeSystem, activeTopic, loadQuestions])

  function handleSystemSelect(sys) {
    setActiveSystem(sys)
    setActiveTopic('All')
  }

  function handleSelect(i) { if (!submitted) setSelected(i) }

  function handleSubmit() {
    if (selected === null) return
    setSubmitted(true)
    const q = bank[index]
    const correctIdx = q.options.findIndex(opt =>
      opt.trim().toUpperCase().startsWith(q.answer.trim().toUpperCase() + '.')
    )
    if (selected === correctIdx) {
      setCorrect(c => c + 1)
      setFeedback({ correct: true, msg: 'Correct ✓' })
    } else {
      setWrong(w => w + 1)
      setFeedback({ correct: false, msg: `Incorrect — Answer: ${q.answer}` })
    }
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
          <div className="quiz-title blue">General Practitioner</div>
        </div>

        {/* System row */}
        <div className="topics" style={{ marginBottom: '8px' }}>
          {systems.map(s => (
            <button
              key={s}
              className={`topic-btn blue${activeSystem === s ? ' active' : ''}`}
              onClick={() => handleSystemSelect(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Topic row — only shows when a system is selected */}
        {activeSystem !== 'All' && topics.length > 0 && (
          <div className="topics">
            {topics.map(t => (
              <button
                key={t}
                className={`topic-btn blue${activeTopic === t ? ' active' : ''}`}
                onClick={() => setActiveTopic(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading && <div className="loading"><div className="spinner blue" />Loading questions...</div>}
        {error && <div className="loading error">{error}</div>}

        {!loading && !error && done && (
          <ResultsScreen correct={correct} wrong={wrong} track="blue" onRestart={handleRestart} />
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
            track="blue"
          />
        )}

        {!loading && !error && bank.length === 0 && (
          <div className="loading">No questions found for this topic.</div>
        )}
      </div>
    </>
  )
}
