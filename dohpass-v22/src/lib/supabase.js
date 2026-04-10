import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qvzvdwvyihwwiqlhgogq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2enZkd3Z5aWh3d2lxbGhnb2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzA5NTcsImV4cCI6MjA5MTI0Njk1N30.WSViWcjW_Q_ZaxNd4iNKZ5UvBXQDRtW4MfBiwC6rS7A'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Specialist ──────────────────────────────────────────────
export async function fetchSpecialistQuestions(topic = null) {
  let query = supabase
    .from('specialist_questions')
    .select('id, topic, subtopic, q, options, answer, explanation')

  if (topic) query = query.eq('topic', topic)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchSpecialistTopics() {
  const { data, error } = await supabase
    .from('specialist_questions')
    .select('topic')

  if (error) throw error

  const unique = ['All', ...new Set(data.map(r => r.topic).filter(Boolean).sort())]
  return unique
}

// ── GP ──────────────────────────────────────────────────────
export async function fetchGPQuestions(topic = null) {
  let query = supabase
    .from('gp_questions')
    .select('id, topic, subtopic, q, options, answer, explanation')

  if (topic) query = query.eq('topic', topic)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchGPTopics() {
  const { data, error } = await supabase
    .from('gp_questions')
    .select('topic')

  if (error) throw error

  const unique = ['All', ...new Set(data.map(r => r.topic).filter(Boolean).sort())]
  return unique
}
