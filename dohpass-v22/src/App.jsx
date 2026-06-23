import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { supabase, ensureProfile, getProfile, hasAccess } from './lib/supabase'
import { registerDeviceSession, startSessionPolling, stopSessionPolling } from './lib/deviceSession'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import BottomNav from './components/BottomNav.jsx'
import ScreenGuard from './components/ScreenGuard.jsx'
import SessionKicked from './components/SessionKicked.jsx'
import Home from './pages/Home.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SpecialistQuiz from './pages/SpecialistQuiz.jsx'
import GPQuiz from './pages/GPQuiz.jsx'
import LoginPage from './pages/AuthPage.jsx'
import FlashcardsHome from './pages/FlashcardsHome.jsx'
import FlashcardsTrack from './pages/FlashcardsTrack.jsx'
import FlashcardSystem from './components/FlashcardSystem.jsx'
import Pricing from './pages/Pricing.jsx'
import Terms from './pages/Terms.jsx'
import Privacy from './pages/Privacy.jsx'
import Contact from './pages/Contact.jsx'
import About from './pages/About.jsx'
import Features from './pages/Features.jsx'
import PaymentSuccess from './pages/PaymentSuccess.jsx'
import Checkout from './pages/Checkout.jsx'
import Account from './pages/Account.jsx'
import Analytics from './pages/Analytics.jsx'
import MockExam from './pages/MockExam.jsx'
import OncologyPage from './pages/OncologyPage.jsx'
import ProgressPage from './pages/ProgressPage'
import Diagnostic from './pages/Diagnostic.jsx'
import Tutor from './pages/Tutor.jsx'
import BlueprintGapAgent from './pages/BlueprintGapAgent.jsx'
import QuestionWriterAgent from './pages/QuestionWriterAgent.jsx'
import GodMode from './pages/GodMode.jsx'

// Captured at module-load time, before Supabase's PKCE handler calls
// history.replaceState to strip ?code= from the URL. True only on the
// one page-load where the user arrives via the email-confirmation link.
const _hadConfirmationCode = new URLSearchParams(window.location.search).has('code')

function ProtectedRoute({ user, children }) {
  if (user === null) return <Navigate to='/login' replace />
  if (user === undefined) return null
  return children
}

function PaidRoute({ user, allowedPlans, children }) {
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getProfile().then(p => { if (!cancelled) setProfile(p ?? null) })
    return () => { cancelled = true }
  }, [user?.id])

  if (user === null) return <Navigate to='/login' replace />
  if (user === undefined) return null
  if (profile === undefined) return null

  if (!hasAccess(profile)) return <Navigate to='/pricing' replace />

  if (allowedPlans) {
    const allowed = [...allowedPlans, 'all_access'].includes(profile.plan)
    if (!allowed) return <Navigate to='/pricing' replace />
  }

  return children
}

function AdminRoute({ user, children }) {
  const [profile, setProfile] = useState(undefined)
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getProfile().then(p => { if (!cancelled) setProfile(p ?? null) })
    return () => { cancelled = true }
  }, [user?.id])
  if (user === null) return <Navigate to='/login' replace />
  if (user === undefined) return null
  if (profile === undefined) return null
  if (!profile?.is_admin) return <Navigate to='/dashboard' replace />
  return children
}

/* ── ScreenGuard wrapper — only for content pages ─────────────── */
const GUARDED_PATHS = ['/specialist', '/gp', '/gems', '/flashcards', '/mock-exam']

function GuardedContent({ children }) {
  const location = useLocation()
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProfile().then(p => {
      if (!cancelled) setPaid(hasAccess(p))
    })
    return () => { cancelled = true }
  }, [])

  const isGuarded = GUARDED_PATHS.some(p => location.pathname.startsWith(p))
  if (isGuarded && paid) return <ScreenGuard>{children}</ScreenGuard>
  return children
}

/* Routes that ship their own glass nav/footer — global chrome is suppressed */
const SELF_CHROMED_PATHS = new Set([
  '/', '/dashboard', '/pricing', '/diagnostic',
  '/terms', '/privacy', '/contact', '/about', '/features',
  '/specialist', '/gp', '/checkout', '/tutor',
])

/* God Mode tools ship a full-screen dark chrome of their own — suppress the
   global Header/Footer/BottomNav across the whole /god-mode/* subtree. */
function isSelfChromed(pathname) {
  return SELF_CHROMED_PATHS.has(pathname) || pathname.startsWith('/god-mode')
}

function ConditionalHeader() {
  const location = useLocation()
  if (isSelfChromed(location.pathname)) return null
  return <Header />
}

/* Footer is hidden on /login, /signup, /auth, self-chromed routes, and flashcard study screens */
function ConditionalFooter() {
  const location = useLocation()
  if (['/login', '/signup', '/auth'].includes(location.pathname)) return null
  if (isSelfChromed(location.pathname)) return null
  if (location.pathname.startsWith('/flashcards')) return null
  return <Footer />
}

function ConditionalBottomNav({ user }) {
  if (!user) return null
  return <BottomNav />
}

/* Public landing for / — logged-in users get redirected to /dashboard */
function HomeRoot({ user }) {
  if (user === undefined) return <Home />
  if (user) return <Navigate to='/dashboard' replace />
  return <Home />
}

function AppRoutes({ user, kicked, onKickedLogin }) {
  if (kicked) {
    return <SessionKicked onLogin={onKickedLogin} />
  }

  return (
    <>
      <ConditionalHeader />
      <GuardedContent>
        <Routes>
          <Route path='/login' element={<LoginPage />} />
          <Route path='/auth' element={<Navigate to='/login' replace />} />
          <Route path='/' element={<HomeRoot user={user} />} />
          <Route path='/dashboard' element={<ProtectedRoute user={user}><Dashboard /></ProtectedRoute>} />
          {/* /specialist and /gp are open to anonymous visitors: the page
              components handle their own gate (3-question localStorage preview
              for anon, server trial/paid flow for authed users). */}
          <Route path='/specialist' element={<SpecialistQuiz />} />
          <Route path='/gp' element={<GPQuiz />} />
          <Route path='/flashcards' element={<ProtectedRoute user={user}><FlashcardsHome /></ProtectedRoute>} />
          <Route path='/gems'       element={<ProtectedRoute user={user}><FlashcardsHome /></ProtectedRoute>} />
          <Route path='/flashcards/:track' element={<ProtectedRoute user={user}><FlashcardsTrack /></ProtectedRoute>} />
          <Route path='/flashcards/:track/:system' element={<ProtectedRoute user={user}><FlashcardSystem userId={user?.id} /></ProtectedRoute>} />
          <Route path='/oncology' element={<OncologyPage />} />
          <Route path='/pricing' element={<Pricing />} />
          <Route path='/checkout' element={<Checkout />} />
          <Route path='/terms'    element={<Terms />} />
          <Route path='/privacy'  element={<Privacy />} />
          <Route path='/contact'  element={<Contact />} />
          <Route path='/about'    element={<About />} />
          <Route path='/features' element={<Features />} />
          <Route path='/diagnostic' element={<ProtectedRoute user={user}><Diagnostic /></ProtectedRoute>} />
          <Route path='/payment-success' element={<ProtectedRoute user={user}><PaymentSuccess /></ProtectedRoute>} />
          <Route path='/account' element={<ProtectedRoute user={user}><Account /></ProtectedRoute>} />
          <Route path='/progress' element={<ProtectedRoute user={user}><ProgressPage /></ProtectedRoute>} />
          <Route path='/analytics' element={<PaidRoute user={user}><Analytics /></PaidRoute>} />
          <Route path='/mock-exam' element={<PaidRoute user={user} allowedPlans={[]}><MockExam /></PaidRoute>} />
          <Route path='/tutor' element={<PaidRoute user={user}><Tutor /></PaidRoute>} />
          <Route path='/god-mode' element={<AdminRoute user={user}><GodMode /></AdminRoute>} />
          <Route path='/god-mode/blueprint' element={<AdminRoute user={user}><BlueprintGapAgent /></AdminRoute>} />
          <Route path='/god-mode/question-writer' element={<AdminRoute user={user}><QuestionWriterAgent /></AdminRoute>} />
        </Routes>
      </GuardedContent>
      <ConditionalFooter />
      <ConditionalBottomNav user={user} />
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
      if (event === 'SIGNED_IN' && u) {
        ensureProfile(u)
        // Fire Google Ads signup-conversion exactly once: only when this page
        // load carried the PKCE ?code= param (email-confirmation redirect).
        // _hadConfirmationCode is false on normal logins (no redirect), password
        // resets (those fire PASSWORD_RECOVERY, not SIGNED_IN), and refreshes
        // (Supabase already cleared ?code= via history.replaceState on first load).
        if (_hadConfirmationCode && typeof window.gtag === 'function') {
          window.gtag('event', 'conversion', { send_to: 'AW-18224272403/nVAbCJ37trscEJOogfJD' })
        }
      }
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
