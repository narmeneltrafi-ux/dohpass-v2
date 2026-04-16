import { useNavigate } from 'react-router-dom'

const IconCross = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

const FOOTER_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Specialist Track', path: '/specialist' },
  { label: 'GP Track', path: '/gp' },
  { label: 'Flashcards', path: '/gems' },
  { label: 'Pricing', path: '/pricing' },
]

export default function Footer() {
  const navigate = useNavigate()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {/* Left: Logo + tagline */}
        <div className="site-footer__brand">
          <div className="site-footer__logo">
            <span className="site-footer__cross"><IconCross /></span>
            <span className="site-footer__name">
              <span className="site-footer__doh">DOH</span>
              <span className="site-footer__pass">Pass</span>
            </span>
          </div>
          <p className="site-footer__tagline">UAE Medical Licensing Prep</p>
        </div>

        {/* Center: Links */}
        <nav className="site-footer__nav">
          {FOOTER_LINKS.map(link => (
            <button
              key={link.path}
              className="site-footer__link"
              onClick={() => navigate(link.path)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right: Copyright */}
        <div className="site-footer__copy">
          &copy; 2025 DOHPass. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
