import { Link } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'

/* Shared footer for every marketing-side page. Every link below points at a
   route that exists in App.jsx — no placeholders, no invented pages. */
const COLUMNS = [
  {
    heading: 'Practise',
    links: [
      { label: 'Specialist questions', to: '/specialist' },
      { label: 'GP questions', to: '/gp' },
      { label: 'Create a free account', to: '/login?mode=signup' },
    ],
  },
  {
    heading: 'DOHPass',
    links: [
      { label: 'Pricing', to: '/pricing' },
      { label: 'Features', to: '/features' },
      { label: 'About', to: '/about' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'Contact', to: '/contact' },
      { label: 'Confirm a bank transfer', to: '/confirm-payment' },
      { label: 'Sign in', to: '/login' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Terms', to: '/terms' },
      { label: 'Privacy', to: '/privacy' },
    ],
  },
]

export default function LandingFooter() {
  return (
    <footer className="dp-foot">
      <div className="dp-foot__inner">
        <div className="dp-foot__brand">
          <Link to="/" className="dp-foot__logo" aria-label="DOHPass home">
            <BrandMark size={26} />
            <span className="dp-nav__word" aria-hidden="true">DOH<span>Pass</span></span>
          </Link>
          <p className="dp-foot__tag">
            Practice questions for the DOH Internal Medicine Specialist and GP licensing exams.
          </p>
          <a className="dp-foot__mail" href="mailto:hello@dohpass.com">hello@dohpass.com</a>
        </div>

        {COLUMNS.map((col) => (
          <nav className="dp-foot__col" key={col.heading} aria-label={col.heading}>
            <h2 className="dp-foot__h">{col.heading}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
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
