import { NavLink, useLocation } from 'react-router-dom'

const IconHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12L12 3l9 9" />
    <path d="M9 21V12h6v9" />
    <path d="M3 12v9h18v-9" />
  </svg>
)
const IconQuestions = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="12" y2="17" />
  </svg>
)
const IconFlashcards = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
  </svg>
)
const IconProgress = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const TABS = [
  { to: '/dashboard',  label: 'Home',       Icon: IconHome },
  { to: '/specialist', label: 'Questions',  Icon: IconQuestions },
  { to: '/flashcards', label: 'Flashcards', Icon: IconFlashcards },
  { to: '/progress',   label: 'Progress',   Icon: IconProgress },
]

/* Paths where the bottom nav should not appear */
const HIDDEN_PATHS = new Set([
  '/', '/login', '/auth', '/signup',
  '/pricing', '/about', '/features',
  '/terms', '/privacy', '/contact', '/checkout',
])

export default function BottomNav() {
  const { pathname } = useLocation()
  if (HIDDEN_PATHS.has(pathname)) return null
  if (pathname.startsWith('/god-mode')) return null

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav__tab${isActive ? ' is-active' : ''}`}
          aria-label={label}
        >
          <span className="bottom-nav__icon"><Icon /></span>
          <span className="bottom-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
