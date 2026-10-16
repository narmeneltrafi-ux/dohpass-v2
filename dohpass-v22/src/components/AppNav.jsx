import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, getProfile, hasAccess } from '../lib/supabase'
import BrandMark from './BrandMark.jsx'

/* Site navigation — one component for marketing pages and the signed-in
   app. Auth-aware: visitors get exam/pricing links and a single primary
   action ("Start free"); signed-in users get their study links, plan
   badge and account button. Below the breakpoint the links move into a
   drawer that traps nothing but closes on Escape, route change and
   outside click, and returns focus to the toggle. */

const PUBLIC_LINKS = [
  { label: 'Specialist', to: { pathname: '/', hash: '#specialist' }, match: '/#specialist' },
  { label: 'GP',         to: { pathname: '/', hash: '#gp' },         match: '/#gp' },
  { label: 'Pricing',    to: '/pricing', match: '/pricing' },
  { label: 'About',      to: '/about',   match: '/about' },
]

const AUTH_LINKS = [
  { label: 'Dashboard',  to: '/dashboard',  match: '/dashboard' },
  { label: 'Specialist', to: '/specialist', match: '/specialist' },
  { label: 'GP',         to: '/gp',         match: '/gp' },
  { label: 'Flashcards', to: '/gems',       match: '/gems' },
  { label: 'Progress',   to: '/progress',   match: '/progress' },
  { label: 'Analytics',  to: '/analytics',  match: '/analytics' },
  { label: 'Pricing',    to: '/pricing',    match: '/pricing' },
]

function planBadge(profile) {
  if (!profile) return null
  const { plan, is_paid } = profile
  if (plan === 'all_access' || (is_paid && plan !== 'gp' && plan !== 'specialist')) return 'All Access'
  if (plan === 'specialist') return 'Specialist'
  if (plan === 'gp') return 'GP'
  return 'Free'
}

function deriveInitials(profile, user) {
  const src = profile?.full_name?.trim() || user?.email || ''
  if (!src) return '?'
  if (profile?.full_name) {
    const parts = src.split(/\s+/).filter(Boolean)
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
  }
  return src.slice(0, 2).toUpperCase()
}

const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
)
const IconClose = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)

// Works on every page: jumps to #main when a page provides it, otherwise to
// the page's first <main> or <h1>.
function skipToContent(e) {
  const target = document.getElementById('main') || document.querySelector('main, h1')
  if (!target) return
  e.preventDefault()
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus()
  target.scrollIntoView({ block: 'start' })
}

export default function AppNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)
  const drawerRef = useRef(null)

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

  // Close the drawer whenever the route (or hash) changes.
  useEffect(() => { setOpen(false) }, [location.pathname, location.hash])

  // Escape + outside click close the drawer; focus returns to the toggle.
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') { setOpen(false); toggleRef.current?.focus() }
    }
    function onClick(e) {
      if (drawerRef.current?.contains(e.target) || toggleRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const isAuthed = !!user
  const badge = hasAccess(profile) ? planBadge(profile) : null
  const isPaid = badge === 'All Access' || badge === 'Specialist' || badge === 'GP'
  const links = isAuthed
    ? [
        ...AUTH_LINKS,
        ...(isPaid ? [{ label: 'Tutor', to: '/tutor', match: '/tutor' }] : []),
        ...(profile?.is_admin ? [{ label: 'Mission Control', to: '/god-mode', match: '/god-mode' }] : []),
      ]
    : PUBLIC_LINKS

  const here = location.pathname + (location.hash || '')
  // On the sign-in page itself, "Sign in" / "Start free" would point at the
  // form the visitor is already looking at.
  const onAuthPage = location.pathname === '/login'
  const isActive = (l) => (l.match.includes('#') ? here === l.match : location.pathname === l.match)

  return (
    <header className={`dp-nav${isAuthed ? ' dp-nav--app' : ''}`}>
      <a className="skip-link" href="#main" onClick={skipToContent}>Skip to content</a>
      <div className="dp-nav__inner">
        <Link className="dp-nav__brand" to={isAuthed ? '/dashboard' : '/'} aria-label="DOHPass home">
          <BrandMark />
          <span className="dp-nav__word" aria-hidden="true">DOH<span>Pass</span></span>
        </Link>

        <nav className="dp-nav__links" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className={`dp-nav__link${isActive(l) ? ' is-active' : ''}`}
              aria-current={isActive(l) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="dp-nav__actions">
          {isAuthed ? (
            <>
              {badge && (
                <Link
                  to="/account"
                  className={`dp-nav__plan${isPaid ? ' is-paid' : ''}`}
                  aria-label={`${badge} plan — open account`}
                >
                  {badge}
                </Link>
              )}
              <Link to="/account" className="dp-nav__avatar" aria-label="Account">
                {deriveInitials(profile, user)}
              </Link>
            </>
          ) : onAuthPage ? null : (
            <>
              <Link to="/login" className="dp-nav__signin">Sign in</Link>
              <button
                type="button"
                className="btn btn--primary btn--sm dp-nav__cta"
                onClick={() => navigate('/login?mode=signup')}
              >
                Start free
              </button>
            </>
          )}
          <button
            ref={toggleRef}
            type="button"
            className="dp-nav__toggle"
            aria-expanded={open}
            aria-controls="dp-nav-drawer"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      <div
        id="dp-nav-drawer"
        ref={drawerRef}
        className={`dp-nav__drawer${open ? ' is-open' : ''}`}
        hidden={!open}
      >
        <nav className="dp-nav__drawer-nav" aria-label="Menu">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className={`dp-nav__drawer-link${isActive(l) ? ' is-active' : ''}`}
              aria-current={isActive(l) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
          {isAuthed ? (
            <Link to="/account" className="dp-nav__drawer-link">
              Account{badge && <span className="dp-nav__drawer-badge">{badge}</span>}
            </Link>
          ) : (
            <Link to="/login" className="dp-nav__drawer-link">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
