import { createClient } from '@supabase/supabase-js'
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

// Landing-page hero stats. Tries direct table reads for specialties + last
// updated; falls back gracefully (null) if anon RLS blocks the table or the
// query errors. Total questions always derived from the existing public RPC.
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
  } catch { /* anon RLS may block — keep specialties null */ }

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
  } catch { /* keep lastUpdated null */ }

  return {
    questions: totalQuestions,
    explanations: totalQuestions,
    specialties,
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
      .select('plan, is_paid, email, full_name, stripe_customer_id, current_period_end, cancel_at_period_end, grace_period_end')
      .eq('id', user.id)
      .single()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// Content access gate. is_paid covers active subscribers; grace_period_end
// keeps access alive briefly after a failed renewal so we don't yank the
// user mid-study. Use this anywhere a paid plan unlocks content — never
// for UI labels (those should still read is_paid directly).
export function hasAccess(profile) {
  if (!profile) return false
  if (profile.is_paid) return true
  return Boolean(
    profile.grace_period_end && new Date(profile.grace_period_end) > new Date()
  )
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
export async function saveProgress(track, questionId, isCorrect, topic = null, selectedAnswer = null, correctAnswer = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_progress').upsert({
    user_id: user.id,
    track,
    question_id: questionId,
    is_correct: isCorrect,
    topic,
    selected_answer: selectedAnswer,
    correct_answer: correctAnswer,
  }, { onConflict: 'user_id,question_id' })
  if (error) console.error('saveProgress error:', error.message)
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

export async function fetchTrialQuestions(track) {
  const { data, error } = await supabase.rpc('get_trial_questions', {
    p_track: track,
    p_limit: 30,
  })
  if (error) { console.error('trial fetch error:', error); return [] }
  return data || []
}

export async function fetchTrialStatus() {
  const { data, error } = await supabase.rpc('get_trial_status')
  if (error || !data) return { used: 0, limit: 30, remaining: 30 }
  return data
}
