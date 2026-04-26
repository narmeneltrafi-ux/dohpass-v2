import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, getProfile } from '../lib/supabase'

/* ── Inline SVG icons ───────────────────────────────────────────── */
const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

const IconLogOut = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

const IconX = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/* ── Plan badge helper ──────────────────────────────────────────── */
function planInfo(profile) {
  if (!profile) return null
  const { plan, is_paid } = profile
  if (plan === 'all_access' || (is_paid && plan !== 'gp' && plan !== 'specialist'))
    return { label: 'ALL ACCESS', cls: 'hdr-badge--all' }
  if (plan === 'specialist') return { label: 'SPECIALIST', cls: 'hdr-badge--gold' }
  if (plan === 'gp') return { label: 'GP PLAN', cls: 'hdr-badge--blue' }
  return { label: 'FREE', cls: 'hdr-badge--free' }
}

/* ── Nav links ──────────────────────────────────────────────────── */
const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Specialist Track', path: '/specialist' },
  { label: 'Oncology', path: '/oncology' },
  { label: 'GP Track', path: '/gp' },
  { label: 'Flashcards', path: '/gems' },
  { label: 'Progress', path: '/progress' },
  { label: 'Pricing', path: '/pricing' },
]

/* ── Header component ───────────────────────────────────────────── */
export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [user, setUser] = useState(undefined) // undefined = loading
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) getProfile().then(setProfile)
    else setProfile(null)
  }, [user])

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const badge = planInfo(profile)
  const isLoggedIn = !!user

  return (
    <header className="site-header">
      <div className="site-header__inner">
        {/* Logo */}
        <div className="site-header__logo" onClick={() => navigate('/')}>
          <span className="site-header__cross"><IconCross /></span>
          <span className="site-header__brand">
            <span className="site-header__doh">DOH</span>
            <span className="site-header__pass">Pass</span>
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="site-header__nav">
          {NAV_LINKS.map(link => (
            <button
              key={link.path}
              className={`site-header__link${location.pathname === link.path ? ' site-header__link--active' : ''}`}
              onClick={() => navigate(link.path)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="site-header__right">
          {isLoggedIn ? (
            <>
              {badge && (
                <button
                  type="button"
                  className={`hdr-badge hdr-badge--link ${badge.cls}`}
                  onClick={() => navigate('/account')}
                  aria-label={`${badge.label} plan — open account`}
                  title="Account"
                >
                  {badge.label}
                </button>
              )}
              <button className="site-header__logout" onClick={handleLogout}>
                <IconLogOut /> Log Out
              </button>
            </>
          ) : (
            <>
              <button className="site-header__login" onClick={() => navigate('/login')}>
                Log In
              </button>
              <button className="site-header__signup" onClick={() => navigate('/login')}>
                Sign Up
              </button>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            className="site-header__hamburger"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`site-header__mobile${mobileOpen ? ' site-header__mobile--open' : ''}`}>
        <nav className="site-header__mobile-nav">
          {NAV_LINKS.map(link => (
            <button
              key={link.path}
              className={`site-header__mobile-link${location.pathname === link.path ? ' site-header__mobile-link--active' : ''}`}
              onClick={() => navigate(link.path)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="site-header__mobile-actions">
          {isLoggedIn ? (
            <>
              {badge && (
                <button
                  type="button"
                  className={`hdr-badge hdr-badge--link ${badge.cls}`}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => navigate('/account')}
                  aria-label={`${badge.label} plan — open account`}
                >
                  {badge.label}
                </button>
              )}
              <button
                className="site-header__mobile-link"
                onClick={() => navigate('/account')}
              >
                Account
              </button>
              <button className="site-header__logout" onClick={handleLogout}>
                <IconLogOut /> Log Out
              </button>
            </>
          ) : (
            <>
              <button className="site-header__login" onClick={() => navigate('/login')} style={{ width: '100%' }}>
                Log In
              </button>
              <button className="site-header__signup" onClick={() => navigate('/login')} style={{ width: '100%' }}>
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
