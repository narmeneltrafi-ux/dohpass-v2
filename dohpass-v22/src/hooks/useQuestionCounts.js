import { useEffect, useState } from 'react'
import { fetchQuestionCounts } from '../lib/supabase'

// One get_question_counts RPC per page load, shared by every component that
// shows a live count (hero, exam panels, plan cards, demo wall). Returns null
// until loaded — and stays null if the RPC fails, so the UI never shows a
// false "0 questions".
let pending = null

function load() {
  if (!pending) {
    pending = fetchQuestionCounts()
      .then((c) => {
        const ok = c && (c.specialist > 0 || c.gp > 0)
        return ok ? c : null
      })
      .catch(() => null)
  }
  return pending
}

export default function useQuestionCounts() {
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    let cancelled = false
    load().then((c) => { if (!cancelled) setCounts(c) })
    return () => { cancelled = true }
  }, [])
  return counts
}
