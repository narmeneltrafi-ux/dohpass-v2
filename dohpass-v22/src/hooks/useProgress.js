import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProgress() {
  const [loading, setLoading] = useState(false)

  const getStats = useCallback(async (track) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return null }

    const { data, error } = await supabase
      .from('user_progress')
      .select('topic, is_correct, answered_at')
      .eq('user_id', user.id)
      .eq('track', track)
      .not('topic', 'is', null)

    setLoading(false)
    if (error || !data) return null

    const byTopic = {}
    for (const row of data) {
      if (!byTopic[row.topic]) byTopic[row.topic] = { correct: 0, total: 0 }
      byTopic[row.topic].total++
      if (row.is_correct) byTopic[row.topic].correct++
    }

    const topics = Object.entries(byTopic).map(([topic, s]) => ({
      topic,
      correct: s.correct,
      total: s.total,
      pct: Math.round((s.correct / s.total) * 100),
    })).sort((a, b) => a.pct - b.pct)

    const totalAttempted = data.length
    const totalCorrect = data.filter(r => r.is_correct).length

    return {
      topics,
      totalAttempted,
      totalCorrect,
      overallPct: totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : 0,
    }
  }, [])

  return { getStats, loading }
}
