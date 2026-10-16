import { Link } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

/* Compact footer for pages outside the marketing set (account, progress,
   analytics, confirm a transfer, …). Same tokens and legal line as
   LandingFooter, fewer links. Every link is a route that exists in App.jsx. */
const LINKS = [
  { label: 'Pricing', to: '/pricing' },
  { label: 'Confirm a bank transfer', to: '/confirm-payment' },
  { label: 'Contact', to: '/contact' },
  { label: 'Terms', to: '/terms' },
  { label: 'Privacy', to: '/privacy' },
]

export default function Footer() {
  return (
    <footer className="dp-foot dp-foot--compact">
      <div className="dp-foot__row">
        <Link to="/" className="dp-foot__logo" aria-label="DOHPass home">
          <BrandMark size={22} />
          <span className="dp-nav__word" aria-hidden="true">DOH<span>Pass</span></span>
        </Link>
        <nav className="dp-foot__nav" aria-label="Footer">
          <ul className="dp-foot__inline">
            {LINKS.map((l) => (
              <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="dp-foot__legal">
        <p>&copy; {new Date().getFullYear()} DOHPass</p>
        <p>
          An independent study resource. Not affiliated with or endorsed by the
          Department of Health – Abu Dhabi.
        </p>
      </div>
    </footer>
  )
}
