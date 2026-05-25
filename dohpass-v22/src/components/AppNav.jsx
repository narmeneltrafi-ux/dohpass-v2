import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase, getProfile } from '../lib/supabase'

/* Unified auth-aware glass-capsule nav (DORMANT — not yet wired into any page).
   Reuses the existing .lp-nav / .lp-nav--auth visual language verbatim so it
   renders identically to the current marketing/dashboard nav on desktop, and
   adds a hamburger + mobile drawer (Header.jsx's proven pattern) so the links
   no longer simply vanish below the breakpoint. */

/* ── Inline SVG icons (copied verbatim from LandingNav / Header) ── */
const IconCross = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
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

/* ── Canonical link sets ─────────────────────────────────────────── */
const PUBLIC_LINKS = [
  { label: 'Features', path: '/features' },
  { label: 'Pricing',  path: '/pricing'  },
  { label: 'About',    path: '/about'    },
]
const AUTH_LINKS = [
  { label: 'Dashboard',  path: '/dashboard'  },
  { label: 'Specialist', path: '/specialist' },
  { label: 'GP',         path: '/gp'         },
  { label: 'Flashcards', path: '/gems'       },
  { label: 'Pricing',    path: '/pricing'    },
]

/* ── Helpers (copied verbatim from LandingNav.jsx) ───────────────── */
function planBadge(profile) {
  if (!profile) return null
  const { plan, is_paid } = profile
  if (plan === 'all_access' || (is_paid && plan !== 'gp' && plan !== 'specialist'))
    return 'All Access'
  if (plan === 'specialist') return 'Specialist'
  if (plan === 'gp') return 'GP'
  return 'Free'
}
const PAID_BADGES = new Set(['All Access', 'Specialist', 'GP'])

function deriveInitials(profile, user) {
  const src = profile?.full_name?.trim() || user?.email || ''
  if (!src) return '?'
  if (profile?.full_name) {
    const parts = src.split(/\s+/).filter(Boolean)
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
  }
  return src.slice(0, 2).toUpperCase()
}

export default function AppNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setUser(data?.user ?? null) })
    getProfile().then((p) => { if (!cancelled) setProfile(p) })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return
      setUser(session?.user ?? null)
      if (session?.user) getProfile().then(setProfile)
      else setProfile(null)
    })
    return () => { cancelled = true; listener?.subscription?.unsubscribe?.() }
  }, [])

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const isAuthed = !!user
  const links = isAuthed ? AUTH_LINKS : PUBLIC_LINKS
  const badge = planBadge(profile)
  const initials = deriveInitials(profile, user)
  const isPaid = PAID_BADGES.has(badge)

  return (
    <>
      <nav className={`lp-nav${isAuthed ? ' lp-nav--auth' : ''}`} aria-label="Primary">
        <div className="lp-nav__brand" onClick={() => navigate(isAuthed ? '/dashboard' : '/')}>
          <span className="lp-nav__cross"><IconCross /></span>
          <span className="lp-nav__name">
            <span className="lp-nav__doh">DOH</span>
            <span className="lp-nav__pass">Pass</span>
          </span>
        </div>

        <div className="lp-nav__links">
          {links.map((l) => (
            <button
              key={l.path}
              className={`lp-nav__link${location.pathname === l.path ? ' lp-nav__link--active' : ''}`}
              onClick={() => navigate(l.path)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="lp-nav__right">
          {isAuthed ? (
            <>
              {badge && (
                <button
                  type="button"
                  className={`lp-nav__planBadge${isPaid ? ' lp-nav__planBadge--paid' : ''}`}
                  onClick={() => navigate('/account')}
                  title={`${badge} plan — open account`}
                  aria-label={`${badge} plan, open account`}
                >
                  {badge}
                </button>
              )}
              <button
                type="button"
                className="lp-nav__avatar"
                onClick={() => navigate('/account')}
                aria-label="Open account"
                title="Account"
              >
                {initials}
              </button>
            </>
          ) : (
            <>
              <button className="lp-nav__signin" onClick={() => navigate('/login')}>Sign In</button>
              <button className="lp-nav__cta" onClick={() => navigate('/pricing')}>
                View Plans
              </button>
            </>
          )}

          {/* Mobile hamburger — hidden on desktop via CSS */}
          <button
            className="lp-nav__hamburger"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer — single flat column, no nested containers */}
      <div className={`lp-nav__mobile${mobileOpen ? ' lp-nav__mobile--open' : ''}`}>
        {links.map((l) => (
          <button
            key={l.path}
            className={`lp-nav__mobile-link${location.pathname === l.path ? ' lp-nav__mobile-link--active' : ''}`}
            onClick={() => navigate(l.path)}
          >
            {l.label}
          </button>
        ))}
        <div className="lp-nav__mobile-divider" />
        {isAuthed ? (
          <>
            {badge && (
              <button
                type="button"
                className={`lp-nav__mobile-link${isPaid ? ' lp-nav__mobile-link--active' : ''}`}
                onClick={() => navigate('/account')}
              >
                {badge}
              </button>
            )}
            <button className="lp-nav__mobile-link" onClick={() => navigate('/account')}>
              Account
            </button>
          </>
        ) : (
          <>
            <button className="lp-nav__mobile-link" onClick={() => navigate('/login')}>
              Sign In
            </button>
            <button className="lp-nav__mobile-cta" onClick={() => navigate('/pricing')}>
              View Plans
            </button>
          </>
        )}
      </div>
    </>
  )
}
