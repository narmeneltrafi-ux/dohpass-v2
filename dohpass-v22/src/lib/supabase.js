import { createClient } from '@supabase/supabase-js'
import { scheduleCard, RATING } from './fsrs.js'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function fetchAllRows(table, selectFields, filters = {}) {
  const PAGE_SIZE = 1000
  let allData = []
  let from = 0
  while (true) {
    let query = supabase
      .from(table)
      .select(selectFields)
      .range(from, from + PAGE_SIZE - 1)
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined) {
        query = query.eq(key, value)
      }
    }
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allData
}

/* ── Topic normalization ──────────────────────────────────────── */
const TOPIC_ALIASES = {
  'Respiratory': 'Respiratory Medicine',
  // Add future merges here: 'OldName': 'CanonicalName'
}

export function primaryTopic(topic) {
  const raw = (topic || '').split(/\/|,/)[0].trim()
  return TOPIC_ALIASES[raw] || raw
}

// ── SPECIALIST ────────────────────────────────────────────────────────────────
export async function fetchSpecialistQuestions(topic = null) {
  const data = await fetchAllRows(
    'specialist_questions',
    'id, topic, subtopic, q, options, answer, explanation'
  )
  if (!topic) return data
  return data.filter(r => primaryTopic(r.topic) === topic)
}

export async function fetchSpecialistTopics() {
  const data = await fetchAllRows('specialist_questions', 'topic')
  const primaries = [...new Set(data.map(r => primaryTopic(r.topic)).filter(Boolean))].sort()
  return ['All', ...primaries]
}

// ── GP ────────────────────────────────────────────────────────────────────────
export async function fetchGPQuestions(topic = null) {
  const data = await fetchAllRows(
    'gp_questions',
    'id, topic, subtopic, q, options, answer, explanation'
  )
  if (!topic) return data
  return data.filter(r => primaryTopic(r.topic) === topic)
}

export async function fetchGPTopics() {
  const data = await fetchAllRows('gp_questions', 'topic')
  const primaries = [...new Set(data.map(r => primaryTopic(r.topic)).filter(Boolean))].sort()
  return ['All', ...primaries]
}

export async function fetchGPSystems() {
  const data = await fetchAllRows('gp_questions', 'broad_topic, topic')
  const systemMap = {}
  data.forEach(r => {
    if (!r.broad_topic) return
    const primary = primaryTopic(r.topic)
    if (!primary) return
    if (!systemMap[r.broad_topic]) systemMap[r.broad_topic] = new Set()
    systemMap[r.broad_topic].add(primary)
  })
  const result = {}
  Object.keys(systemMap).sort().forEach(sys => {
    result[sys] = ['All', ...Array.from(systemMap[sys]).sort()]
  })
  return result
}

export async function fetchGPQuestionsBySystem(broadTopic) {
  return fetchAllRows(
    'gp_questions',
    'id, topic, subtopic, q, options, answer, explanation',
    { broad_topic: broadTopic }
  )
}

// ── QUESTION COUNTS ──────────────────────────────────────────────────────────

export async function fetchQuestionCounts() {
  const { data, error } = await supabase.rpc('get_question_counts')
  if (error || !data) return { specialist: 0, gp: 0, flashcards: 0 }
  return {
    specialist: data.specialist ?? 0,
    gp: data.gp ?? 0,
    flashcards: data.flashcards ?? 0,
  }
}

// Anonymous fallback for the SPECIALTIES cell on the landing hero.
// RLS on specialist_questions / gp_questions only allows authenticated paid
// users to SELECT, so the direct-query path below returns nothing for
// anonymous visitors and the cell renders an em-dash. Until a SECURITY
// DEFINER RPC is added (follow-up PR), unauthenticated visitors see this
// hardcoded floor instead. The real value at the time of writing is ~10
// primary topics across both tracks; "10+" is a conservative public floor.
const SPECIALTIES_ANON_FLOOR = 10

// Landing-page hero stats. The QUESTIONS and FLASHCARDS counts come from the
// existing get_question_counts RPC (anon-callable). SPECIALTIES and
// last-updated try direct table reads — these succeed for paid authenticated
// users, but RLS blocks them for anonymous visitors. On RLS-block / error,
// SPECIALTIES falls back to SPECIALTIES_ANON_FLOOR (never em-dash); last
// updated falls back to "today" downstream.
export async function fetchLandingStats() {
  const counts = await fetchQuestionCounts()
  const totalQuestions = (counts.specialist || 0) + (counts.gp || 0)

  let specialties = null
  let lastUpdated = null

  try {
    const [specialistTopics, gpTopics] = await Promise.all([
      supabase.from('specialist_questions').select('topic').limit(5000),
      supabase.from('gp_questions').select('topic').limit(5000),
    ])
    if (!specialistTopics.error && !gpTopics.error) {
      const all = [
        ...(specialistTopics.data || []),
        ...(gpTopics.data || []),
      ]
      const uniq = new Set(
        all.map(r => primaryTopic(r.topic)).filter(Boolean)
      )
      if (uniq.size > 0) specialties = uniq.size
    }
  } catch { /* keep specialties null — fallback applied below */ }

  if (specialties == null) specialties = SPECIALTIES_ANON_FLOOR

  try {
    const [s, g] = await Promise.all([
      supabase.from('specialist_questions')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      supabase.from('gp_questions')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    const candidates = []
    if (!s.error && s.data?.[0]?.created_at) candidates.push(new Date(s.data[0].created_at))
    if (!g.error && g.data?.[0]?.created_at) candidates.push(new Date(g.data[0].created_at))
    if (candidates.length) {
      lastUpdated = new Date(Math.max(...candidates.map(d => d.getTime())))
    }
  } catch { /* keep lastUpdated null → "today" downstream */ }

  return {
    questions: totalQuestions,
    specialties,
    flashcards: counts.flashcards || 0,
    // Per-track counts so the home pricing teaser can render live numbers
    // without making its own RPC call (kept in sync with /pricing)
    gp:         counts.gp || 0,
    specialist: counts.specialist || 0,
    lastUpdated,
  }
}

// ── ANALYTICS ────────────────────────────────────────────────────────────────

export async function fetchFullProgress(track) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  return fetchAllRows('user_progress', 'question_id, is_correct, created_at', {
    user_id: user.id,
    track,
  })
}

export async function fetchAllQuestionsMinimal(track) {
  const table = track === 'specialist' ? 'specialist_questions' : 'gp_questions'
  return fetchAllRows(table, 'id, topic')
}

// ── STRIPE CHECKOUT ──────────────────────────────────────────────────────────

export async function createCheckoutSession(priceId, userId, userEmail) {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { priceId, userId, userEmail },
  })
  if (error) return { url: null, error: error.message }
  return { url: data.url, error: null }
}

// Open the Stripe Customer Portal for the current user. Caller redirects
// to the returned URL. On 404 ("No active subscription") returns a
// user-friendly error message instead of a generic one.
export async function createPortalSession() {
  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {},
  })
  if (error) {
    // supabase.functions.invoke wraps all non-2xx as a single error; surface
    // the 404 case specifically so the UI can prompt the user to subscribe.
    const msg = /non-2xx/i.test(error.message ?? '') || /404/.test(error.message ?? '')
      ? 'No active subscription. Subscribe on the Pricing page before managing it here.'
      : error.message
    return { url: null, error: msg }
  }
  return { url: data.url, error: null }
}

// ── MANUAL BANK-TRANSFER ORDERS ───────────────────────────────────────────────

// Unambiguous alphabet — no I/O/0/1 so the reference is easy to read and type
// into a bank memo. 32^8 ≈ 1.1e12 space; the DB UNIQUE constraint is the
// integrity backstop.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePaymentReference() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[bytes[i] % REF_ALPHABET.length]
  return `DOH-${s.slice(0, 4)}-${s.slice(4, 8)}`
}

// Insert a PENDING manual order for the current user. The column-scoped INSERT
// grant means only these four fields are writable — status defaults to
// 'pending' and grant dates stay service-role only. There is no client path to
// activate access; an admin runs the Phase 3 grant after confirming transfer.
// Returns { error } — null on success.
export async function createManualOrder({ amountAed, paymentReference }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in to place an order.' }
  const { error } = await supabase.from('manual_orders').insert({
    user_id: user.id,
    user_email: user.email,
    amount_aed: amountAed,
    payment_reference: paymentReference,
  })
  if (error) return { error }
  return { error: null }
}

// ── PROFILES ──────────────────────────────────────────────────────────────────

// Upsert a profile row for the given user. Call once on sign-in.
export async function ensureProfile(user) {
  if (!user) return
  const { error } = await supabase.from('profiles').upsert(
    { id: user.id, email: user.email },
    { onConflict: 'id', ignoreDuplicates: true }
  )
  if (error) console.error('ensureProfile error:', error.message)
}

// Returns the current user's profile: { plan, is_paid, email, full_name,
// stripe_customer_id, current_period_end, cancel_at_period_end,
// grace_period_end }.
// Returns null if unauthenticated or profiles table not yet available.
// stripe_* columns are nullable for free-tier users who haven't subscribed.
export async function getProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('plan, is_paid, is_admin, email, full_name, stripe_customer_id, current_period_end, cancel_at_period_end, grace_period_end, access_expires_at, exam_date, exam_name')
      .eq('id', user.id)
      .single()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// Content access gate. Precedence:
//   1. access_expires_at  — manual bank-transfer rail. DATED access: granted
//      only while the timestamp is in the future, so it RE-LOCKS automatically
//      on expiry. Manual grants set this and leave is_paid = false.
//   2. is_paid            — legacy Stripe subscribers (indefinite while true).
//   3. grace_period_end   — keeps Stripe access alive briefly after a failed
//      renewal so we don't yank the user mid-study.
// Use this anywhere a paid plan unlocks content — never for UI labels.
export function hasAccess(profile) {
  if (!profile) return false
  if (profile.access_expires_at && new Date(profile.access_expires_at) > new Date()) return true
  if (profile.is_paid) return true
  return Boolean(
    profile.grace_period_end && new Date(profile.grace_period_end) > new Date()
  )
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────

// Dual-write on every answer submission:
//   1. question_attempts — append-only log, never overwritten (source of truth
//      for SRS, adaptive selection, and performance trajectory)
//   2. user_progress — latest-state cache; a DB trigger maintains total_attempts,
//      consecutive_correct, and last_attempt_at automatically. FSRS scheduling
//      fields (stability, difficulty, due_date, fsrs_state) are written here too.
export async function saveProgress(
  track, questionId, isCorrect,
  topic = null, selectedAnswer = null, correctAnswer = null,
  responseTimeMs = null
) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Fetch existing FSRS state for this question (single PK lookup, ~15ms).
  // Only rows that have been scheduled before will have stability set.
  const { data: existing } = await supabase
    .from('user_progress')
    .select('stability, difficulty, due_date, fsrs_state, last_attempt_at')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle()

  // Map correctness to FSRS rating. GOOD for correct, AGAIN for wrong.
  // HARD / EASY require explicit user input — not yet wired to the UI.
  const rating = isCorrect ? RATING.GOOD : RATING.AGAIN

  // Treat rows without stability as new cards so FSRS initialises cleanly
  // rather than inheriting a stale stability=null default.
  const card = (existing && existing.stability != null) ? {
    stability:  existing.stability,
    difficulty: existing.difficulty,
    due_date:   existing.due_date,
    reps:       0,   // reps/lapses not stored on user_progress — FSRS still
    lapses:     0,   // computes correct stability from stability+difficulty+r
    last_review: existing.last_attempt_at,
    fsrs_state: existing.fsrs_state,
  } : null

  const fsrs = scheduleCard(card, rating)

  const [{ error: attemptErr }, { error: progressErr }] = await Promise.all([
    supabase.from('question_attempts').insert({
      user_id:          user.id,
      track,
      question_id:      questionId,
      is_correct:       isCorrect,
      topic,
      selected_answer:  selectedAnswer,
      correct_answer:   correctAnswer,
      response_time_ms: responseTimeMs ?? null,
    }),
    supabase.from('user_progress').upsert({
      user_id:         user.id,
      track,
      question_id:     questionId,
      is_correct:      isCorrect,
      topic,
      selected_answer: selectedAnswer,
      correct_answer:  correctAnswer,
      // FSRS scheduling state
      stability:  fsrs.stability,
      difficulty: fsrs.difficulty,
      due_date:   fsrs.due_date,
      fsrs_state: fsrs.fsrs_state,
    }, { onConflict: 'user_id,question_id' }),
  ])

  if (attemptErr)  console.error('saveProgress attempt insert error:', attemptErr.message)
  if (progressErr) console.error('saveProgress upsert error:', progressErr.message)
}

// Returns true if the current user has content access (paid or in grace period).
export async function getUserPlan() {
  const profile = await getProfile()
  return hasAccess(profile)
}

export async function fetchProgress(track) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { answered: 0, correct: 0 }
  const { data, error } = await supabase
    .from('user_progress')
    .select('is_correct')
    .eq('user_id', user.id)
    .eq('track', track)
  if (error || !data) return { answered: 0, correct: 0 }
  return {
    answered: data.length,
    correct: data.filter(r => r.is_correct).length,
  }
}

// All-time progress for the current user across every track. Used by the
// dashboard stats bar — single round-trip instead of per-track fetches.
export async function fetchOverallProgress() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { answered: 0, correct: 0 }
  const { data, error } = await supabase
    .from('user_progress')
    .select('is_correct')
    .eq('user_id', user.id)
  if (error || !data) return { answered: 0, correct: 0 }
  return {
    answered: data.length,
    correct: data.filter(r => r.is_correct).length,
  }
}

export async function fetchStreak() {
  const { data, error } = await supabase.rpc('get_user_streak')
  if (error) return null
  return data ?? 0
}

// Count of questions the current user has answered in the last 7 days.
// Uses an exact head-only count for speed (no row payload).
export async function fetchWeeklyAnswered() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('question_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if (error) return 0
  return count ?? 0
}

// ── TWO-STAGE QUIZ LOADING ────────────────────────────────────────────────────

// Stage 1: fetch lightweight id list for the filtered set (~KB, not MB).
// Specialist: fetches all id+topic rows then filters in JS via primaryTopic().
//   The topic column stores composite values like "Cardiology/Sub" that require
//   splitting + alias resolution — not cleanly replicable as a server-side .eq().
//   Filtering a KB-sized id list in JS is negligible.
// GP: filter is a broad_topic system name → server-side .eq(), no JS filtering needed.
export async function fetchQuestionIdList(track, filter = null) {
  if (track === 'specialist') {
    const data = await fetchAllRows('specialist_questions', 'id, topic')
    if (!filter) return data
    return data.filter(r => primaryTopic(r.topic) === filter)
  }
  const filters = filter ? { broad_topic: filter } : {}
  return fetchAllRows('gp_questions', 'id, topic, broad_topic', filters)
}

// Stage 2: fetch full question content for a specific batch of ids.
export async function fetchQuestionsByIds(track, ids) {
  if (!ids || ids.length === 0) return []
  const table = track === 'specialist' ? 'specialist_questions' : 'gp_questions'
  const { data, error } = await supabase
    .from(table)
    .select('id, topic, subtopic, q, options, answer, explanation')
    .in('id', ids)
  if (error) throw error
  return data || []
}

// ── DIAGNOSTIC ASSESSMENT ─────────────────────────────────────────────────────

// Selects 20 questions spread across the 10 most-represented topics for a track.
// Topic frequency is a reliable proxy for exam weight since AI generation targets
// blueprint proportions. Free to call — no hasAccess() gate (diagnostic is free).
export async function fetchDiagnosticQuestions(track) {
  const allIds = await fetchQuestionIdList(track)

  // Group by normalized topic
  const byTopic = new Map()
  for (const r of allIds) {
    const topic = primaryTopic(r.topic)
    if (!topic) continue
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic).push(r.id)
  }

  // Sort topics by question count descending (high-frequency = high exam weight)
  const sortedTopics = [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length)

  // Sample 2 from each of the top 10 topics
  const selectedIds = []
  for (const [, pool] of sortedTopics.slice(0, 10)) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    selectedIds.push(...shuffled.slice(0, 2))
  }

  const questions = await fetchQuestionsByIds(track, selectedIds)
  return questions.sort(() => Math.random() - 0.5)
}

// Save the user's target exam date and exam name to their profile.
// Shown in AI coaching context to make plans time-aware.
export async function saveExamDate(examDate, examName = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const { error } = await supabase
    .from('profiles')
    .update({ exam_date: examDate, exam_name: examName })
    .eq('id', user.id)
  return { error: error ?? null }
}

export async function completeDiagnostic(track) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({
    diagnostic_completed_at: new Date().toISOString(),
    diagnostic_track: track,
  }).eq('id', user.id)
}

// Returns how many questions the current user answered today (calendar day, local time).
export async function fetchTodayAnswered() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from('question_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())
  if (error) return 0
  return count ?? 0
}

// Consolidated single-RPC replacement for 5 separate dashboard queries.
// Returns { specialist, gp, today_answered, weekly_answered, flashcard_due }
// where specialist/gp are { answered, correct }. Returns null on error.
export async function fetchUserDashboardStats() {
  const { data, error } = await supabase.rpc('get_user_dashboard_stats')
  if (error || !data) return null
  return {
    specialist:      { answered: data.specialist_answered ?? 0, correct: data.specialist_correct ?? 0 },
    gp:              { answered: data.gp_answered ?? 0,         correct: data.gp_correct ?? 0 },
    total_answered:  data.total_answered  ?? 0,
    today_answered:  data.today_answered  ?? 0,
    weekly_answered: data.weekly_answered ?? 0,
    flashcard_due:   data.flashcard_due   ?? 0,
  }
}

// ── FLASHCARD DUE COUNT ───────────────────────────────────────────────────────

// Returns how many flashcards are due for review right now. Used by Dashboard.
export async function fetchFlashcardDueCount() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count, error } = await supabase
    .from('flashcard_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lte('due_date', new Date().toISOString())
  if (error) return 0
  return count ?? 0
}

// Returns up to `limit` topics with the lowest accuracy for a track.
// Fix 6: Uses question_attempts (append-only log) rather than user_progress
// (latest-state cache). Takes the last 5 attempts per question so a single
// lucky correct answer no longer masks a pattern of wrong ones.
// Requires at least `minAttempts` weighted attempts before a topic qualifies.
export async function fetchWeakTopics(track, limit = 3, minAttempts = 3) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Last 500 attempts ordered newest first — covers most active users easily.
  const { data, error } = await supabase
    .from('question_attempts')
    .select('question_id, is_correct, topic, created_at')
    .eq('user_id', user.id)
    .eq('track', track)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error || !data) return []

  // For each question take only the last 5 attempts (trajectory, not lifetime average)
  const byQuestion = new Map()
  for (const row of data) {
    if (!byQuestion.has(row.question_id)) {
      byQuestion.set(row.question_id, { topic: primaryTopic(row.topic) || 'Unknown', attempts: [] })
    }
    const q = byQuestion.get(row.question_id)
    if (q.attempts.length < 5) q.attempts.push(row.is_correct)
  }

  // Aggregate per topic
  const topicStats = {}
  for (const [, { topic, attempts }] of byQuestion) {
    if (!topicStats[topic]) topicStats[topic] = { correct: 0, total: 0 }
    for (const correct of attempts) {
      topicStats[topic].total++
      if (correct) topicStats[topic].correct++
    }
  }

  return Object.entries(topicStats)
    .filter(([, a]) => a.total >= minAttempts)
    .map(([topic, a]) => ({ topic, accuracy: Math.round((a.correct / a.total) * 100), total: a.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .filter(t => t.accuracy < 75)
    .slice(0, limit)
}

// ── ADAPTIVE QUESTION SELECTION ───────────────────────────────────────────────

// Fetches the current user's answered-question summary for a track.
// Returns seenIds (Set), wrongIds (Set), topicAccuracy ({topic: {correct, total}}),
// and progressMap (Map<questionId, {due_date, stability, fsrs_state}>).
// Used by sortAdaptive to score and prioritise the question id list.
export async function fetchUserProgressSummary(track) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { seenIds: new Set(), wrongIds: new Set(), topicAccuracy: {}, progressMap: new Map() }

  const { data, error } = await supabase
    .from('user_progress')
    .select('question_id, is_correct, topic, due_date, stability, fsrs_state')
    .eq('user_id', user.id)
    .eq('track', track)

  if (error || !data) return { seenIds: new Set(), wrongIds: new Set(), topicAccuracy: {}, progressMap: new Map() }

  const seenIds = new Set(data.map(r => r.question_id))
  const wrongIds = new Set(data.filter(r => !r.is_correct).map(r => r.question_id))

  const topicAccuracy = {}
  const progressMap = new Map()

  for (const row of data) {
    const topic = primaryTopic(row.topic) || 'Unknown'
    if (!topicAccuracy[topic]) topicAccuracy[topic] = { correct: 0, total: 0 }
    topicAccuracy[topic].total++
    if (row.is_correct) topicAccuracy[topic].correct++

    progressMap.set(row.question_id, {
      due_date:   row.due_date,
      stability:  row.stability,
      fsrs_state: row.fsrs_state,
    })
  }

  return { seenIds, wrongIds, topicAccuracy, progressMap }
}

// Scores each question in idList and returns a sorted copy (highest priority first).
//
// Scoring weights (Fix 4: FSRS-aware):
//   FSRS due score   0.35 — questions past their scheduled review date rank highest
//   Topic weakness   0.25 — low accuracy on this topic boosts priority
//   Unseen bonus     0.25 — never-attempted questions get a lift
//   Wrong bonus      0.15 — previously incorrect questions get a lift
//   Jitter           0.08 — prevents identical scores from producing a fixed order
//
// progressMap is optional; callers that haven't migrated yet still work correctly.
export function sortAdaptive(idList, { seenIds, wrongIds, topicAccuracy, progressMap }) {
  const now = Date.now()

  const scored = idList.map(q => {
    const topic    = primaryTopic(q.topic) || 'Unknown'
    const acc      = topicAccuracy[topic]
    const prog     = progressMap?.get(q.id)

    // FSRS due score: 1.0 = overdue/never seen; scales linearly over 7 days
    // past due. 0.5 = no FSRS data yet. 0 = reviewed very recently.
    let fsrsDue = 0.5
    if (prog?.due_date) {
      const daysOverdue = (now - new Date(prog.due_date).getTime()) / 86400000
      fsrsDue = Math.min(1, Math.max(0, daysOverdue / 7 + 0.5))
    } else if (!prog) {
      fsrsDue = 0.5 // new card — unseen bonus handles it
    }

    const topicScore  = acc ? 1 - (acc.correct / acc.total) : 0.5
    const unseenScore = seenIds.has(q.id) ? 0 : 1
    const wrongScore  = wrongIds.has(q.id) ? 1 : 0

    const score = (
      fsrsDue     * 0.35 +
      topicScore  * 0.25 +
      unseenScore * 0.25 +
      wrongScore  * 0.15 +
      Math.random() * 0.08
    )
    return { q, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.q)
}

export async function fetchTrialQuestions(track) {
  const { data, error } = await supabase.rpc('get_trial_questions', {
    p_track: track,
    p_limit: 30,
  })
  if (error) { console.error('trial fetch error:', error); return [] }
  return data || []
}

// Anonymous (unauthenticated) preview. Server caps p_limit at 5; the 3-question
// preview cap is enforced client-side via localStorage in the quiz pages.
export async function fetchPreviewQuestions(track, limit = 3) {
  const { data, error } = await supabase.rpc('get_preview_questions', {
    p_track: track,
    p_limit: limit,
  })
  if (error) { console.error('preview fetch error:', error); return [] }
  return data || []
}

export async function fetchTrialStatus() {
  const { data, error } = await supabase.rpc('get_trial_status')
  if (error || !data) return { used: 0, limit: 10, remaining: 10 }
  return data
}

// ── RETENTION CARDS ───────────────────────────────────────────────────────────

// Count of user_progress rows where due_date <= now (FSRS cards due for review).
// Returns 0 on error — safe to display as "all caught up".
export async function fetchDueCount() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count, error } = await supabase
    .from('user_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lte('due_date', new Date().toISOString())
  if (error) return 0
  return count ?? 0
}

// Per-topic blueprint coverage for a given track.
// Returns array of { topic, attempted, total, pct } sorted lowest pct first.
// Questions without a matching topic in the active set are ignored.
export async function fetchBlueprintCoverage(track) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const table = track === 'specialist' ? 'specialist_questions' : 'gp_questions'

  const [questionsRes, attemptsRes] = await Promise.all([
    supabase.from(table).select('id, topic').eq('is_active', true),
    supabase
      .from('question_attempts')
      .select('question_id, topic')
      .eq('user_id', user.id)
      .eq('track', track),
  ])

  if (questionsRes.error || !questionsRes.data) return []

  // Total active questions per topic
  const totalByTopic = {}
  for (const row of questionsRes.data) {
    const t = primaryTopic(row.topic)
    if (!t) continue
    totalByTopic[t] = (totalByTopic[t] || 0) + 1
  }

  // Distinct questions attempted per topic (count each question_id once)
  const attemptedByTopic = {}
  if (!attemptsRes.error && attemptsRes.data) {
    const seen = new Map() // question_id → topic
    for (const row of attemptsRes.data) {
      if (seen.has(row.question_id)) continue
      seen.set(row.question_id, true)
      const t = primaryTopic(row.topic)
      if (!t || totalByTopic[t] == null) continue
      attemptedByTopic[t] = (attemptedByTopic[t] || 0) + 1
    }
  }

  return Object.entries(totalByTopic)
    .map(([topic, total]) => {
      const attempted = attemptedByTopic[topic] || 0
      return { topic, attempted, total, pct: total > 0 ? Math.round((attempted / total) * 100) : 0 }
    })
    .sort((a, b) => a.pct - b.pct)
}
