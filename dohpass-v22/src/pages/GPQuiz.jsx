import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  supabase,
  fetchGPQuestions,
  fetchGPSystems,
  fetchGPQuestionsBySystem,
  saveProgress,
  getProfile,
  hasAccess,
  fetchTrialQuestions,
  fetchTrialStatus,
  fetchPreviewQuestions,
} from '../lib/supabase'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'
import { BookmarkButton } from '../components/BookmarkButton'
import { useBookmarks } from '../hooks/useBookmarks'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

const ANON_KEY = 'dohpass_anon_trial'
const ANON_LIMIT = 3

function readAnonCount() {
  try {
    const n = parseInt(localStorage.getItem(ANON_KEY) || '0', 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function incrementAnonCount() {
  const next = readAnonCount() + 1
  try { localStorage.setItem(ANON_KEY, String(next)) } catch { /* private mode */ }
  return next
}

function PaywallGate({ title, body, ctaLabel, ctaPath = '/pricing' }) {
  const navigate = useNavigate()
  return (
    <div className="paywall-wrap">
      <div className="paywall-card">
        <div className="paywall-icon">🔒</div>
        <h2 className="paywall-title">{title}</h2>
        <p className="paywall-body">{body}</p>
        <button className="btn-primary blue paywall-cta" onClick={() => navigate(ctaPath)}>
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

export default function GPQuiz() {
  const navigate = useNavigate()
  const { bookmarks, toggle } = useBookmarks('gp')
  const [systems, setSystems] = useState(['All'])
  const [activeSystem, setActiveSystem] = useState('All')
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

  // null = checking, true = anonymous (no session), false = authed
  const [isAnon, setIsAnon] = useState(null)
  // null = loading, true = paid, false = free (only meaningful when isAnon === false)
  const [isPaid, setIsPaid] = useState(null)
  const [plan, setPlan] = useState(null)
  const [trialStatus, setTrialStatus] = useState(null) // { used, limit, remaining }
  const [anonUsed, setAnonUsed] = useState(0)
  // Snapshot of anonUsed at mount, used to size the bank without retriggering
  // loadQuestions on every submit-driven increment.
  const anonUsedAtMountRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) {
        const used = readAnonCount()
        anonUsedAtMountRef.current = used
        setAnonUsed(used)
        setIsAnon(true)
        return
      }
      setIsAnon(false)
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

  const planAllowed = isAnon === false && isPaid === true && (plan === 'gp' || plan === 'all_access')
  const trialActive = isAnon === false && isPaid === false && trialStatus !== null && trialStatus.remaining > 0
  const trialExhausted = isAnon === false && isPaid === false && trialStatus !== null && trialStatus.remaining === 0
  const wrongPlan = isAnon === false && isPaid === true && plan !== 'gp' && plan !== 'all_access'
  const anonActive = isAnon === true && anonUsed < ANON_LIMIT
  const anonExhausted = isAnon === true && anonUsed >= ANON_LIMIT

  useEffect(() => {
    if (!planAllowed) return
    fetchGPSystems().then(map => {
      setSystems(['All', ...Object.keys(map)])
    }).catch(console.error)
  }, [planAllowed])

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let data = []
      if (planAllowed) {
        data = activeSystem === 'All'
          ? await fetchGPQuestions(null)
          : await fetchGPQuestionsBySystem(activeSystem)
      } else if (trialActive) {
        data = await fetchTrialQuestions('gp')
      } else if (anonActive) {
        const remaining = Math.max(0, ANON_LIMIT - anonUsedAtMountRef.current)
        data = await fetchPreviewQuestions('gp', remaining)
      }
      setBank(shuffle(data))
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
    } catch {
      setError('Failed to load questions. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [planAllowed, trialActive, anonActive, activeSystem])

  useEffect(() => {
    if (isAnon === null) return
    if (isAnon === true) {
      if (anonActive) loadQuestions()
      else setLoading(false)
      return
    }
    if (isPaid === null) return
    if (isPaid === false && trialStatus === null) return
    if (planAllowed || trialActive) loadQuestions()
    else setLoading(false)
  }, [isAnon, anonActive, isPaid, trialStatus, planAllowed, trialActive, loadQuestions])

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
    if (isAnon) {
      setAnonUsed(incrementAnonCount())
    } else {
      await saveProgress('gp', q.id, isCorrect, q.topic, String.fromCharCode(65 + selected), q.answer)
    }
  }

  function handleNext() {
    if (index + 1 >= bank.length) { setDone(true); return }
    setIndex(i => i + 1)
    setSelected(null); setSubmitted(false); setFeedback(null)
  }

  async function handleRestart() {
    if (isPaid && plan && (plan === 'gp' || plan === 'all_access')) {
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
    const data = await fetchTrialQuestions('gp')
    setBank(shuffle(data))
    setIndex(0); setCorrect(0); setWrong(0)
    setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
  }

  if (wrongPlan) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="quiz-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
          <div className="quiz-title blue">General Practitioner</div>
        </div>
        <PaywallGate
          title="Wrong Plan"
          body="This track requires the GP plan or All Access."
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
          <div className="quiz-title blue">General Practitioner</div>
        </div>
        <PaywallGate
          title="Trial used up"
          body="You've used all 10 free trial questions. Upgrade to continue practicing."
          ctaLabel="Upgrade to Unlimited"
        />
      </div>
    )
  }

  // Anonymous preview cap. Gated on !submitted so the user can finish viewing
  // feedback for the question that pushed them to the limit before the
  // paywall takes over.
  if (anonExhausted && !submitted) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="quiz-header">
          <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
          <div className="quiz-title blue">General Practitioner</div>
        </div>
        <PaywallGate
          title="Preview limit reached"
          body="Create a free account to unlock 10 questions — no payment needed"
          ctaLabel="Sign up free"
          ctaPath="/login"
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="loading"><div className="spinner blue" />Loading questions...</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="loading error">{error}</div>
      </div>
    )
  }
  if (done) {
    if (isAnon) {
      return (
        <div className="quiz-page" style={{ paddingTop: '62px' }}>
          <div className="quiz-header">
            <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
            <div className="quiz-title blue">General Practitioner</div>
          </div>
          <PaywallGate
            title="Preview complete"
            body="Create a free account to unlock 10 questions — no payment needed"
            ctaLabel="Sign up free"
            ctaPath="/login"
          />
        </div>
      )
    }
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <ResultsScreen correct={correct} wrong={wrong} track="blue" onRestart={handleRestart} />
      </div>
    )
  }
  if (bank.length === 0) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="loading">No questions found for this system.</div>
      </div>
    )
  }

  const anonRemaining = Math.max(0, ANON_LIMIT - anonUsed)

  const chromeTop = (
    <>
      {anonActive && (
        <div className="qui-trial qui-trial--blue" role="status">
          Free preview · {anonRemaining} of {ANON_LIMIT} questions left
        </div>
      )}
      {trialActive && (
        <div className="qui-trial qui-trial--blue" role="status">
          Free trial · {trialStatus.remaining} of {trialStatus.limit} questions left
        </div>
      )}
      {planAllowed && systems.length > 1 && (
        <div className="filter-pills-scroll" aria-label="Filter by system">
          <div className="filter-pills">
            {systems.map(s => (
              <button
                key={s}
                className={`filter-pill${activeSystem === s ? ' filter-pill--active' : ''} filter-pill--blue`}
                onClick={() => setActiveSystem(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )

  const chromeBookmark = (
    <BookmarkButton
      questionId={bank[index].id}
      topic={bank[index].topic}
      bookmarks={bookmarks}
      toggle={toggle}
    />
  )

  return (
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
      mode="tutor"
      chromeTop={chromeTop}
      chromeBookmark={chromeBookmark}
    />
  )
}
