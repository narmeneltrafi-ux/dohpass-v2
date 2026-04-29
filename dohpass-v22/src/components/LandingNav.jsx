import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase, getProfile } from '../lib/supabase'

/* Shared glass capsule navbar for the marketing-side pages.
   Auto-detects auth: logged-out users get the marketing variant
   (Sign In + Start Free Trial); logged-in users get the same plan-badge
   + initials avatar treatment that lives on the dashboard nav. */

const IconCross = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

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

export default function LandingNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)

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

  const isAuthed = !!user
  const links = isAuthed ? AUTH_LINKS : PUBLIC_LINKS
  const badge = planBadge(profile)
  const initials = deriveInitials(profile, user)
  const isPaid = PAID_BADGES.has(badge)

  return (
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
              Start Free Trial
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
