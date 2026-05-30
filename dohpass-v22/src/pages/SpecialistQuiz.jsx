import { useState, useEffect, useCallback, useReducer, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  supabase,
  fetchQuestionIdList,
  fetchQuestionsByIds,
  fetchSpecialistTopics,
  saveProgress,
  getProfile,
  hasAccess,
  fetchTrialQuestions,
  fetchTrialStatus,
  fetchPreviewQuestions,
  fetchUserProgressSummary,
  fetchWeakTopics,
  sortAdaptive,
  primaryTopic,
} from '../lib/supabase'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
import QuestionCard from '../components/QuestionCard'
import ResultsScreen from '../components/ResultsScreen'
import { BookmarkButton } from '../components/BookmarkButton'
import { useBookmarks } from '../hooks/useBookmarks'

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5) }

const ANON_KEY = 'dohpass_anon_trial'
const ANON_LIMIT = 3
const PREFETCH_WINDOW = 10

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
        <button className="btn-primary gold paywall-cta" onClick={() => navigate(ctaPath)}>
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

export default function SpecialistQuiz() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { bookmarks, toggle } = useBookmarks('specialist')
  const [topics, setTopics] = useState(['All'])
  const [activeTopic, setActiveTopic] = useState('All')
  const [drillTopics, setDrillTopics] = useState([])

  // Stage 1: shuffled [{id, topic}] list — loaded instantly, powers counter + progress bar.
  const [shuffledIds, setShuffledIds] = useState([])
  // Stage 2: full content cache keyed by id. Refs avoid stale closures in prefetchBatch.
  const contentCacheRef = useRef(new Map())
  const prefetchingRef = useRef(new Set())
  const questionStartedAt = useRef(Date.now())
  // Bumped after each prefetch batch to trigger a re-render so currentQuestion updates.
  const [, bumpCache] = useReducer(x => x + 1, 0)

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

  const planAllowed = isAnon === false && isPaid === true && (plan === 'specialist' || plan === 'all_access')
  const isDrillMode = planAllowed && searchParams.get('drill') === '1'
  const trialActive = isAnon === false && isPaid === false && trialStatus !== null && trialStatus.remaining > 0
  const trialExhausted = isAnon === false && isPaid === false && trialStatus !== null && trialStatus.remaining === 0
  const wrongPlan = isAnon === false && isPaid === true && plan !== 'specialist' && plan !== 'all_access'
  const anonActive = isAnon === true && anonUsed < ANON_LIMIT
  const anonExhausted = isAnon === true && anonUsed >= ANON_LIMIT

  useEffect(() => {
    if (!planAllowed) return
    fetchSpecialistTopics().then(setTopics).catch(console.error)
  }, [planAllowed])

  // Fetch full content for a batch of ids and populate the cache.
  const prefetchBatch = useCallback(async (ids) => {
    const toFetch = ids.filter(id =>
      !contentCacheRef.current.has(id) && !prefetchingRef.current.has(id)
    )
    if (toFetch.length === 0) return
    toFetch.forEach(id => prefetchingRef.current.add(id))
    try {
      const questions = await fetchQuestionsByIds('specialist', toFetch)
      questions.forEach(q => contentCacheRef.current.set(q.id, q))
      bumpCache()
    } finally {
      toFetch.forEach(id => prefetchingRef.current.delete(id))
    }
  }, [bumpCache])

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    contentCacheRef.current = new Map()
    prefetchingRef.current = new Set()
    try {
      let idList = []
      if (planAllowed) {
        const topicFilter = isDrillMode ? null : (activeTopic === 'All' ? null : activeTopic)
        const [rawIds, summary, weakTopicData] = await Promise.all([
          fetchQuestionIdList('specialist', topicFilter),
          fetchUserProgressSummary('specialist'),
          // trajectory-based via question_attempts (last 5 per question) — consistent
          // with the Dashboard drill widget; no extra latency since it's parallel
          isDrillMode ? fetchWeakTopics('specialist', 5) : Promise.resolve([]),
        ])
        let pool = rawIds
        if (isDrillMode) {
          const weakTopicNames = weakTopicData.map(t => t.topic)
          setDrillTopics(weakTopicNames)
          if (weakTopicNames.length > 0) {
            pool = rawIds.filter(q => weakTopicNames.includes(primaryTopic(q.topic)))
          }
        }
        idList = sortAdaptive(pool, summary)
        if (isDrillMode) idList = idList.slice(0, 40)
      } else if (trialActive) {
        // Trial ≤30 questions — populate cache directly, no two-stage needed.
        const data = await fetchTrialQuestions('specialist')
        data.forEach(q => contentCacheRef.current.set(q.id, q))
        idList = data.map(q => ({ id: q.id, topic: q.topic }))
      } else if (anonActive) {
        // Anon preview ≤5 questions — populate cache directly.
        const remaining = Math.max(0, ANON_LIMIT - anonUsedAtMountRef.current)
        const data = await fetchPreviewQuestions('specialist', remaining)
        data.forEach(q => contentCacheRef.current.set(q.id, q))
        idList = data.map(q => ({ id: q.id, topic: q.topic }))
      }
      // Non-paid paths were already shuffled above; paid uses sortAdaptive.
      const ordered = planAllowed ? idList : shuffle(idList)
      setShuffledIds(ordered)
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
      // Stage 2: prefetch first window (paid path only — trial/anon already in cache).
      if (planAllowed && ordered.length > 0) {
        prefetchBatch(ordered.slice(0, PREFETCH_WINDOW).map(r => r.id))
      }
    } catch {
      setError('Failed to load questions. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [planAllowed, trialActive, anonActive, activeTopic, prefetchBatch])

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

  // As the user advances, prefetch the next window so they never wait between questions.
  useEffect(() => {
    if (!planAllowed || shuffledIds.length === 0) return
    const ids = shuffledIds.slice(index + 1, index + 1 + PREFETCH_WINDOW).map(r => r.id)
    if (ids.length > 0) prefetchBatch(ids)
  }, [index, shuffledIds, planAllowed, prefetchBatch])

  // Derived from Stage 1 data — available immediately after id-list loads.
  const currentEntry = shuffledIds[index] ?? null
  const currentQuestion = currentEntry
    ? contentCacheRef.current.get(currentEntry.id) ?? null
    : null
  const total = shuffledIds.length

  function handleSelect(i) { if (!submitted) setSelected(i) }

  async function handleSubmit() {
    if (selected === null || !currentQuestion) return
    const q = currentQuestion
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
    const responseTimeMs = Math.round(Date.now() - questionStartedAt.current)
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
      await saveProgress('specialist', q.id, isCorrect, q.topic, String.fromCharCode(65 + selected), q.answer, responseTimeMs)
    }
  }

  function handleNext() {
    if (index + 1 >= total) { setDone(true); return }
    setIndex(i => i + 1)
    questionStartedAt.current = Date.now()
    setSelected(null); setSubmitted(false); setFeedback(null)
  }

  async function handleRestart() {
    questionStartedAt.current = Date.now()
    if (isPaid && plan && (plan === 'specialist' || plan === 'all_access')) {
      // Re-fetch progress summary so newly answered questions influence the new ordering.
      const summary = await fetchUserProgressSummary('specialist')
      const reordered = sortAdaptive([...shuffledIds], summary)
      setShuffledIds(reordered)
      setIndex(0); setCorrect(0); setWrong(0)
      setSelected(null); setSubmitted(false); setFeedback(null); setDone(false)
      prefetchBatch(reordered.slice(0, PREFETCH_WINDOW).map(r => r.id))
      return
    }
    const status = await fetchTrialStatus()
    setTrialStatus(status)
    if (status.remaining === 0) {
      setDone(false)
      return
    }
    const data = await fetchTrialQuestions('specialist')
    contentCacheRef.current = new Map()
    data.forEach(q => contentCacheRef.current.set(q.id, q))
    const idList = data.map(q => ({ id: q.id, topic: q.topic }))
    setShuffledIds(shuffle(idList))
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
          ctaPath="/checkout?plan=specialist"
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
          body="You've used all 10 free trial questions. Upgrade to continue practicing."
          ctaLabel="Upgrade to Unlimited"
          ctaPath="/checkout?plan=specialist"
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
          <div className="quiz-title gold">Internal Medicine Specialist</div>
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
        <div className="loading"><div className="spinner" />Loading questions...</div>
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
            <div className="quiz-title gold">Internal Medicine Specialist</div>
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
        <ResultsScreen correct={correct} wrong={wrong} track="gold" onRestart={handleRestart} />
      </div>
    )
  }
  if (total === 0) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="loading">No questions found for this topic.</div>
      </div>
    )
  }
  // Rare: prefetch hasn't arrived yet for the current question. Spinner only —
  // prefetchBatch is already in-flight from the index-advance useEffect.
  if (!currentQuestion) {
    return (
      <div className="quiz-page" style={{ paddingTop: '62px' }}>
        <div className="loading"><div className="spinner" />Loading question...</div>
      </div>
    )
  }

  const anonRemaining = Math.max(0, ANON_LIMIT - anonUsed)

  const chromeTop = (
    <>
      {anonActive && (
        <div className="qui-trial qui-trial--gold" role="status">
          Free preview · {anonRemaining} of {ANON_LIMIT} questions left
        </div>
      )}
      {trialActive && (
        <div className="qui-trial qui-trial--gold" role="status">
          Free trial · {trialStatus.remaining} of {trialStatus.limit} questions left
        </div>
      )}
      {isDrillMode && (
        <div className="qui-drill-badge" role="status">
          Drill mode · {total} questions
          {drillTopics.length > 0
            ? <span className="qui-drill-badge__topics"> · {drillTopics.join(' · ')}</span>
            : <span> · weak topics only</span>}
        </div>
      )}
      {planAllowed && !isDrillMode && topics.length > 1 && (
        <div className="filter-pills-scroll" aria-label="Filter by topic">
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
    </>
  )

  // currentEntry.topic is available from Stage 1 — no need to wait for full content.
  const chromeBookmark = (
    <BookmarkButton
      questionId={currentEntry.id}
      topic={currentEntry.topic}
      bookmarks={bookmarks}
      toggle={toggle}
    />
  )

  return (
    <QuestionCard
      question={currentQuestion}
      index={index}
      total={total}
      correct={correct}
      wrong={wrong}
      selectedOption={selected}
      submitted={submitted}
      onSelect={handleSelect}
      onSubmit={handleSubmit}
      onNext={handleNext}
      feedback={feedback}
      track="gold"
      mode="tutor"
      chromeTop={chromeTop}
      chromeBookmark={chromeBookmark}
      backPath={isAnon ? '/' : '/dashboard'}
      backLabel={isAnon ? 'Home' : 'Dashboard'}
      isPaid={planAllowed}
    />
  )
}
