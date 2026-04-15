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

function primaryTopic(topic) {
  return (topic || '').split(/\/|,/)[0].trim()
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
// Requires a `profiles` table: id uuid PK (= auth.uid()), is_paid boolean default false
export async function getUserPlan() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data, error } = await supabase
      .from('profiles')
      .select('is_paid')
      .eq('id', user.id)
      .single()
    if (error || !data) return false
    return data.is_paid === true
  } catch {
    return false
  }
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
