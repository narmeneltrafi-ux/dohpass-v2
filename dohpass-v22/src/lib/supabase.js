import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qvzvdwvyihwwiqlhgogq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2enZkd3Z5aWh3d2lxbGhnb2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzA5NTcsImV4cCI6MjA5MTI0Njk1N30.WSViWcjW_Q_ZaxNd4iNKZ5UvBXQDRtW4MfBiwC6rS7A'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Fetches ALL rows from a table by paginating in chunks of 1000
async function fetchAllRows(table, selectFields, filters = {}) {
  const PAGE_SIZE = 1000
  let allData = []
  let from = 0

  while (true) {
    let query = supabase
      .from(table)
      .select(selectFields)
      .range(from, from + PAGE_SIZE - 1)

    // Apply any eq filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined) {
        query = query.eq(key, value)
      }
    }

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    allData = allData.concat(data)

    // If we got fewer rows than PAGE_SIZE, we've reached the end
    if (data.length < PAGE_SIZE) break

    from += PAGE_SIZE
  }

  return allData
}

export async function fetchSpecialistQuestions(topic = null) {
  return fetchAllRows(
    'specialist_questions',
    'id, topic, subtopic, q, options, answer, explanation',
    topic ? { topic } : {}
  )
}

export async function fetchSpecialistTopics() {
  const data = await fetchAllRows('specialist_questions', 'topic')
  const unique = ['All', ...new Set(data.map(r => r.topic).filter(Boolean).sort())]
  return unique
}

export async function fetchGPQuestions(topic = null) {
  return fetchAllRows(
    'gp_questions',
    'id, topic, subtopic, q, options, answer, explanation',
    topic ? { topic } : {}
  )
}

export async function fetchGPTopics() {
  const data = await fetchAllRows('gp_questions', 'topic')
  const unique = ['All', ...new Set(data.map(r => r.topic).filter(Boolean).sort())]
  return unique
}

export async function fetchGPSystems() {
  const data = await fetchAllRows('gp_questions', 'broad_topic, topic')

  const systemMap = {}
  data.forEach(r => {
    if (!r.broad_topic || !r.topic) return
    if (!systemMap[r.broad_topic]) systemMap[r.broad_topic] = new Set()
    systemMap[r.broad_topic].add(r.topic)
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
