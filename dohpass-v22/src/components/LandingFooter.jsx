import { useNavigate } from 'react-router-dom'

const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

/* Shared footer used on every marketing-side page. The dashboard does not
   render a footer at all, so this component intentionally lives outside of
   that route. All links here point at real working routes. */
export default function LandingFooter() {
  const navigate = useNavigate()

  return (
    <footer className="lp-foot" aria-label="Site footer">
      <div className="lp-foot__cols">
        <div className="lp-foot__brand">
          <div className="lp-foot__logo" onClick={() => navigate('/')}>
            <span className="lp-foot__cross"><IconCross /></span>
            <span className="lp-foot__name">
              <span className="lp-foot__doh">DOH</span>
              <span className="lp-foot__pass">Pass</span>
            </span>
          </div>
          <p className="lp-foot__tag">UAE medical licensing prep, written by physicians.</p>
        </div>

        <div className="lp-foot__col">
          <h4>Platform</h4>
          <button onClick={() => navigate('/features')}>Features</button>
          <button onClick={() => navigate('/pricing')}>Pricing</button>
          <button onClick={() => navigate('/login')}>Sign In</button>
        </div>

        <div className="lp-foot__col">
          <h4>Resources</h4>
          {/* FAQ lives on /pricing — anchor link scrolls to it after navigation */}
          <a href="/pricing#faq">FAQ</a>
          <button onClick={() => navigate('/about')}>About</button>
          <button onClick={() => navigate('/pricing')}>Start trial</button>
        </div>

        <div className="lp-foot__col">
          <h4>Legal</h4>
          <button onClick={() => navigate('/terms')}>Terms</button>
          <button onClick={() => navigate('/privacy')}>Privacy</button>
          <button onClick={() => navigate('/contact')}>Contact</button>
        </div>
      </div>

      <div className="lp-foot__stroke" aria-hidden="true">DOHPASS</div>

      <div className="lp-foot__bottom">
        <span>&copy; {new Date().getFullYear()} DOHPass. All rights reserved.</span>
        <span className="lp-foot__status">
          <span className="lp-foot__statusDot" />
          All systems operational
        </span>
      </div>
    </footer>
  )
}
