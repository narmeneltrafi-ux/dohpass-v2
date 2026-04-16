import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { supabase, ensureProfile } from './lib/supabase'
import { registerDeviceSession, startSessionPolling, stopSessionPolling, clearDeviceSession } from './lib/deviceSession'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import ScreenGuard from './components/ScreenGuard.jsx'
import SessionKicked from './components/SessionKicked.jsx'
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

/* ── ScreenGuard wrapper — only for content pages ─────────────── */
const GUARDED_PATHS = ['/specialist', '/gp', '/gems', '/flashcards', '/mock-exam']

function GuardedContent({ children }) {
  const location = useLocation()
  const isGuarded = GUARDED_PATHS.some(p => location.pathname.startsWith(p))
  if (isGuarded) return <ScreenGuard>{children}</ScreenGuard>
  return children
}

/* Footer is hidden on /login and /signup */
function ConditionalFooter() {
  const location = useLocation()
  const hide = ['/login', '/signup', '/auth'].includes(location.pathname)
  if (hide) return null
  return <Footer />
}

function AppRoutes({ user, kicked, onKickedLogin }) {
  if (kicked) {
    return <SessionKicked onLogin={onKickedLogin} />
  }

  return (
    <>
      <Header />
      <GuardedContent>
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
      </GuardedContent>
      <ConditionalFooter />
    </>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [kicked, setKicked] = useState(false)

  /* ── Existing auth flow — UNTOUCHED ─────────────────────────── */
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

  /* ── Device session management — separate from auth ─────────── */
  const handleKicked = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setKicked(true)
  }, [])

  useEffect(() => {
    if (!user) {
      stopSessionPolling()
      return
    }

    registerDeviceSession(user.id)
    startSessionPolling(user.id, handleKicked)

    return () => {
      stopSessionPolling()
    }
  }, [user, handleKicked])

  const handleKickedLogin = useCallback(() => {
    setKicked(false)
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes user={user} kicked={kicked} onKickedLogin={handleKickedLogin} />
    </BrowserRouter>
  )
}
