import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useBookmarks(track) {
  const [bookmarks, setBookmarks] = useState(new Set())

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('user_bookmarks')
        .select('question_id')
        .eq('user_id', user.id)
        .eq('track', track)
        .then(({ data }) => {
          if (data) setBookmarks(new Set(data.map(r => r.question_id)))
        })
    })
  }, [track])

  const toggle = useCallback(async (questionId, topic) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const isBookmarked = bookmarks.has(questionId)
    if (isBookmarked) {
      await supabase.from('user_bookmarks').delete()
        .eq('user_id', user.id).eq('question_id', questionId)
      setBookmarks(prev => { const s = new Set(prev); s.delete(questionId); return s })
    } else {
      await supabase.from('user_bookmarks')
        .insert({ user_id: user.id, question_id: questionId, track, topic })
      setBookmarks(prev => new Set(prev).add(questionId))
    }
  }, [bookmarks, track])

  const getBookmarkedQuestions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data: bm } = await supabase.from('user_bookmarks')
      .select('question_id').eq('user_id', user.id).eq('track', track)
    if (!bm?.length) return []
    const ids = bm.map(b => b.question_id)
    const table = track === 'specialist' ? 'specialist_questions' : 'gp_questions'
    const { data: qs } = await supabase.from(table).select('*').in('id', ids)
    return qs || []
  }, [track])

  return { bookmarks, toggle, getBookmarkedQuestions }
}
