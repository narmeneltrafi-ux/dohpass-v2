import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Home from './pages/Home.jsx'
import SpecialistQuiz from './pages/SpecialistQuiz.jsx'
import GPQuiz from './pages/GPQuiz.jsx'
import AuthPage from './pages/AuthPage.jsx'
import FlashcardsHome from './pages/FlashcardsHome.jsx'
import FlashcardsTrack from './pages/FlashcardsTrack.jsx'
import FlashcardSystem from './components/FlashcardSystem.jsx'

function ProtectedRoute({ user, children }) {
  if (user === null) return <Navigate to='/auth' replace />
  if (user === undefined) return null
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/auth' element={<AuthPage />} />
        <Route path='/' element={<ProtectedRoute user={user}><Home /></ProtectedRoute>} />
        <Route path='/specialist' element={<ProtectedRoute user={user}><SpecialistQuiz /></ProtectedRoute>} />
        <Route path='/gp' element={<ProtectedRoute user={user}><GPQuiz /></ProtectedRoute>} />
        <Route path='/flashcards' element={<ProtectedRoute user={user}><FlashcardsHome /></ProtectedRoute>} />
        <Route path='/flashcards/:track' element={<ProtectedRoute user={user}><FlashcardsTrack /></ProtectedRoute>} />
        <Route path='/flashcards/:track/:system' element={<ProtectedRoute user={user}><FlashcardSystem userId={user?.id} /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
