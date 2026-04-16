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
  const [specialist, gp] = await Promise.all([
    supabase.from('specialist_questions').select('*', { count: 'exact', head: true }),
    supabase.from('gp_questions').select('*', { count: 'exact', head: true }),
  ])
  return {
    specialist: specialist.count ?? 0,
    gp: gp.count ?? 0,
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

// Returns the current user's profile: { plan, is_paid, email, full_name }
// Returns null if unauthenticated or profiles table not yet available.
export async function getProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('plan, is_paid, email, full_name')
      .eq('id', user.id)
      .single()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────
export async function saveProgress(track, questionId, isCorrect) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_progress').upsert({
    user_id: user.id,
    track,
    question_id: questionId,
    is_correct: isCorrect,
  }, { onConflict: 'user_id,question_id' })
  if (error) console.error('saveProgress error:', error.message)
}

// Returns true if the current user has an active paid plan.
export async function getUserPlan() {
  const profile = await getProfile()
  return profile?.is_paid === true
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
