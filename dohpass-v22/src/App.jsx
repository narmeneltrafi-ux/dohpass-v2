import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, ensureProfile } from './lib/supabase'
import Home from './pages/Home.jsx'
import SpecialistQuiz from './pages/SpecialistQuiz.jsx'
import GPQuiz from './pages/GPQuiz.jsx'
import LoginPage from './pages/AuthPage.jsx'
import FlashcardsHome from './pages/FlashcardsHome.jsx'
import FlashcardsTrack from './pages/FlashcardsTrack.jsx'
import FlashcardSystem from './components/FlashcardSystem.jsx'
import Pricing from './pages/Pricing.jsx'
import PaymentSuccess from './pages/PaymentSuccess.jsx'
import Analytics from './pages/Analytics.jsx'
import MockExam from './pages/MockExam.jsx'

function ProtectedRoute({ user, children }) {
  if (user === null) return <Navigate to='/login' replace />
  if (user === undefined) return null
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      if (u) ensureProfile(u)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (event === 'SIGNED_IN' && u) ensureProfile(u)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/login' element={<LoginPage />} />
        <Route path='/auth' element={<Navigate to='/login' replace />} />
        <Route path='/' element={<ProtectedRoute user={user}><Home /></ProtectedRoute>} />
        <Route path='/specialist' element={<ProtectedRoute user={user}><SpecialistQuiz /></ProtectedRoute>} />
        <Route path='/gp' element={<ProtectedRoute user={user}><GPQuiz /></ProtectedRoute>} />
        <Route path='/flashcards' element={<ProtectedRoute user={user}><FlashcardsHome /></ProtectedRoute>} />
        <Route path='/gems'       element={<ProtectedRoute user={user}><FlashcardsHome /></ProtectedRoute>} />
        <Route path='/flashcards/:track' element={<ProtectedRoute user={user}><FlashcardsTrack /></ProtectedRoute>} />
        <Route path='/flashcards/:track/:system' element={<ProtectedRoute user={user}><FlashcardSystem userId={user?.id} /></ProtectedRoute>} />
        <Route path='/pricing' element={<Pricing />} />
        <Route path='/payment-success' element={<ProtectedRoute user={user}><PaymentSuccess /></ProtectedRoute>} />
        <Route path='/analytics' element={<ProtectedRoute user={user}><Analytics /></ProtectedRoute>} />
        <Route path='/mock-exam' element={<ProtectedRoute user={user}><MockExam /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
