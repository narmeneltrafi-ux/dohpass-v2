import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qvzvdwvyihwwiqlhgogq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2enZkd3Z5aWh3d2lxbGhnb2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzA5NTcsImV4cCI6MjA5MTI0Njk1N30.WSViWcjW_Q_ZaxNd4iNKZ5UvBXQDRtW4MfBiwC6rS7A'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function fetchSpecialistQuestions(topic = null) {
  let query = supabase
    .from('specialist_questions')
    .select('id, topic, subtopic, q, options, answer, explanation')
    .limit(2000)
  if (topic) query = query.eq('topic', topic)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchSpecialistTopics() {
  const { data, error } = await supabase
    .from('specialist_questions')
    .select('topic')
    .limit(2000)
  if (error) throw error
  const unique = ['All', ...new Set(data.map(r => r.topic).filter(Boolean).sort())]
  return unique
}

export async function fetchGPQuestions(topic = null) {
  let query = supabase
    .from('gp_questions')
    .select('id, topic, subtopic, q, options, answer, explanation')
    .limit(2000)
  if (topic) query = query.eq('topic', topic)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchGPTopics() {
  const { data, error } = await supabase
    .from('gp_questions')
    .select('topic')
    .limit(2000)
  if (error) throw error
  const unique = ['All', ...new Set(data.map(r => r.topic).filter(Boolean).sort())]
  return unique
}
export async function fetchGPSystems() {
  const { data, error } = await supabase
    .from('gp_questions')
    .select('broad_topic, topic')
    .limit(2000)
  if (error) throw error
  
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
  const { data, error } = await supabase
    .from('gp_questions')
    .select('id, topic, subtopic, q, options, answer, explanation')
    .eq('broad_topic', broadTopic)
    .limit(2000)
  if (error) throw error
  return data
}
