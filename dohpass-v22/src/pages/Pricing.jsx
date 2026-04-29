import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  supabase,
  getProfile,
  createCheckoutSession,
  fetchQuestionCounts,
} from '../lib/supabase'

/* ───────────────────────────────────────────────────────────────
   STRIPE PRICE IDs — preserved per "do not change checkout logic".
   Wiring is intentionally OFF while migrating to Lemon Squeezy.
   ─────────────────────────────────────────────────────────────── */
const PRICE_GP         = import.meta.env.VITE_STRIPE_PRICE_GP
const PRICE_SPECIALIST = import.meta.env.VITE_STRIPE_PRICE_SPECIALIST
const PRICE_ALL_ACCESS = import.meta.env.VITE_STRIPE_PRICE_ALL_ACCESS
if (!PRICE_GP || !PRICE_SPECIALIST || !PRICE_ALL_ACCESS) {
  console.error('Pricing: missing VITE_STRIPE_PRICE_* env vars')
}

/* ───────────────────────────────────────────────────────────────
   ICONS
   ─────────────────────────────────────────────────────────────── */
const IconCross = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)
const IconCheck = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconChevron = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const IconShield = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

/* ───────────────────────────────────────────────────────────────
   PLAN BADGE / FIRST-NAME / INITIALS — same logic as Dashboard
   ─────────────────────────────────────────────────────────────── */
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

/* ───────────────────────────────────────────────────────────────
   GLASS CAPSULE NAV — auto-detects auth state
   ─────────────────────────────────────────────────────────────── */
function PricingNav({ navigate, user, profile }) {
  const isAuthed = !!user

  if (isAuthed) {
    const links = [
      { label: 'Dashboard',  path: '/dashboard' },
      { label: 'Specialist', path: '/specialist' },
      { label: 'GP',         path: '/gp' },
      { label: 'Flashcards', path: '/gems' },
      { label: 'Pricing',    path: '/pricing' },
    ]
    const badge = planBadge(profile)
    const initials = deriveInitials(profile, user)
    const isPaid = PAID_BADGES.has(badge)
    return (
      <nav className="lp-nav lp-nav--auth" aria-label="Primary">
        <div className="lp-nav__brand" onClick={() => navigate('/dashboard')}>
          <span className="lp-nav__cross"><IconCross /></span>
          <span className="lp-nav__name">
            <span className="lp-nav__doh">DOH</span>
            <span className="lp-nav__pass">Pass</span>
          </span>
        </div>
        <div className="lp-nav__links">
          {links.map(l => (
            <button
              key={l.path}
              className={`lp-nav__link${l.path === '/pricing' ? ' lp-nav__link--active' : ''}`}
              onClick={() => navigate(l.path)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="lp-nav__right">
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
        </div>
      </nav>
    )
  }

  // Logged-out variant matches Home.jsx
  return (
    <nav className="lp-nav" aria-label="Primary">
      <div className="lp-nav__brand" onClick={() => navigate('/')}>
        <span className="lp-nav__cross"><IconCross /></span>
        <span className="lp-nav__name">
          <span className="lp-nav__doh">DOH</span>
          <span className="lp-nav__pass">Pass</span>
        </span>
      </div>
      <div className="lp-nav__links">
        <a href="#plans"  className="lp-nav__link">Plans</a>
        <a href="#faq"    className="lp-nav__link">FAQ</a>
        <a href="/"       className="lp-nav__link">About</a>
      </div>
      <div className="lp-nav__right">
        <button className="lp-nav__signin" onClick={() => navigate('/login')}>Sign In</button>
        <button className="lp-nav__cta" onClick={() => navigate('/pricing')}>
          Start Free Trial
        </button>
      </div>
    </nav>
  )
}

/* ───────────────────────────────────────────────────────────────
   1. HERO
   ─────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-pricing-h1">
      <div className="lp-hero__grid" aria-hidden="true" />
      <div className="lp-hero__inner">
        <div className="lp-hero__badge">
          <span className="lp-hero__pulse" />
          Simple pricing · Cancel anytime
        </div>
        <h1 className="lp-hero__h1" id="lp-pricing-h1">
          One price.
          <br />
          <span className="lp-hero__h1-gold">Pass faster.</span>
        </h1>
        <p className="lp-hero__sub">
          Full access to thousands of questions, written by UAE physicians, mapped to the current DOH blueprint.
        </p>
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   2. PRICING CARDS
   ─────────────────────────────────────────────────────────────── */
// Render `${n.toLocaleString()}+` when count is loaded, em-dash otherwise.
// Never falls back to a hardcoded number.
function liveCount(n) {
  return n != null ? `${n.toLocaleString()}+` : '—'
}

function buildPlans(counts) {
  return [
    {
      id: 'gp',
      eyebrow: 'For DOH GP licensing',
      name: 'GP Track',
      price: '49',
      priceId: PRICE_GP,
      features: [
        `${liveCount(counts?.gp)} GP questions`,
        'Mapped to DOH GP blueprint',
        'Detailed explanations',
        'Mobile-friendly',
      ],
      ctaLabel: 'Start GP Track',
      variant: 'ghost',
    },
    {
      id: 'specialist',
      eyebrow: 'For Internal Medicine Specialist exam',
      name: 'Specialist Track',
      price: '69',
      priceId: PRICE_SPECIALIST,
      features: [
        `${liveCount(counts?.specialist)} specialist questions`,
        'Cardiology, Respiratory, Nephrology & more',
        'MRCP-style format',
        'Detailed clinical explanations',
      ],
      ctaLabel: 'Start Specialist',
      variant: 'gold',
      recommended: true,
    },
    {
      id: 'all_access',
      eyebrow: 'Both tracks + flashcards',
      name: 'All Access',
      price: '89',
      priceId: PRICE_ALL_ACCESS,
      features: [
        'Everything in GP + Specialist',
        `${liveCount(counts?.flashcards)} flashcards`,
        'Mock exams',
        'All future content included',
      ],
      ctaLabel: 'Get All Access',
      variant: 'ghost',
    },
  ]
}

function PlanCard({ plan, currentPlan }) {
  const isCurrent = currentPlan === plan.id
  return (
    <article
      className={`lp-plan lp-pp-plan${plan.recommended ? ' lp-plan--rec' : ''}`}
      aria-labelledby={`plan-${plan.id}-name`}
    >
      {plan.recommended && <span className="lp-plan__rec">Recommended</span>}

      <div className="lp-pp-plan__eyebrow">{plan.eyebrow}</div>
      <h3 className="lp-plan__name lp-pp-plan__name" id={`plan-${plan.id}-name`}>{plan.name}</h3>

      <div className="lp-plan__price lp-pp-plan__price">
        <span className="lp-plan__num lp-pp-plan__num">{plan.price}</span>
        <span className="lp-pp-plan__cur">AED</span>
        <span className="lp-plan__per">/ month</span>
      </div>

      <ul className="lp-plan__feats">
        {plan.features.map((f) => (
          <li key={f}>
            <span className="lp-plan__check"><IconCheck /></span>
            {f}
          </li>
        ))}
      </ul>

      {/* All plan CTAs render in identical ghost state while Stripe is off and
          Lemon Squeezy isn't wired yet. Showing a single solid gold pill on the
          recommended plan would mislead users into thinking checkout works.
          Recommended treatment lives at the CARD level (gold border, glow, tint)
          and the RECOMMENDED pill — never on the disabled CTA. When the new
          checkout lands, the recommended plan returns to a primary gold pill. */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="lp-pp-plan__cta lp-pp-plan__cta--ghost"
      >
        {isCurrent ? 'Current plan' : plan.ctaLabel}
      </button>

      <div className="lp-pp-plan__soon" aria-live="polite">Coming soon</div>
    </article>
  )
}

function PricingGrid({ counts, profile }) {
  const plans = buildPlans(counts)
  const currentPlan = profile?.plan || 'free'
  return (
    <section className="lp-pp-plans" id="plans" aria-label="Available plans">
      <div className="lp-pp-plans__grid">
        {plans.map((p) => <PlanCard key={p.id} plan={p} currentPlan={currentPlan} />)}
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   3. TRUST ROW
   ─────────────────────────────────────────────────────────────── */
function TrustRow() {
  const items = [
    '7-day money-back guarantee',
    'Cancel anytime · No contracts',
    'Secure payment · 256-bit encryption',
  ]
  return (
    <div className="lp-pp-trust">
      {items.map((label, i) => (
        <div className="lp-pp-trust__cell" key={i}>
          <span className="lp-pp-trust__icon"><IconShield /></span>
          <span className="lp-pp-trust__label">{label}</span>
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   4. COMPARISON TABLE
   ─────────────────────────────────────────────────────────────── */
function makeComparisonRows(counts) {
  const totalQ = counts?.specialist != null && counts?.gp != null
    ? (counts.specialist + counts.gp)
    : null
  return [
    {
      label: 'Question count',
      gp: liveCount(counts?.gp),
      specialist: liveCount(counts?.specialist),
      all: liveCount(totalQ),
    },
    {
      label: 'Specialties covered',
      gp: 'GP only',
      specialist: 'All specialist',
      all: 'All',
    },
    { label: 'Mock exams', gp: false, specialist: false, all: true },
    {
      label: 'Flashcards',
      gp: false,
      specialist: false,
      all: counts?.flashcards != null ? `${counts.flashcards.toLocaleString()}+` : true,
    },
    { label: 'Mobile access', gp: true, specialist: true, all: true },
    { label: 'Email support', gp: true, specialist: true, all: true },
    { label: 'Future content', gp: false, specialist: false, all: true },
  ]
}

function CmpCell({ value }) {
  if (value === true)  return <span className="lp-pp-cmp__yes" aria-label="Included"><IconCheck /></span>
  if (value === false) return <span className="lp-pp-cmp__no"  aria-label="Not included">—</span>
  return <span className="lp-pp-cmp__val">{value}</span>
}

function ComparisonTable({ counts }) {
  const [open, setOpen] = useState(false)
  const rows = makeComparisonRows(counts)
  return (
    <div className="lp-pp-cmp">
      <button
        type="button"
        className={`lp-pp-cmp__toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls="lp-pp-cmp-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Compare plans</span>
        <span className="lp-pp-cmp__chev"><IconChevron /></span>
      </button>

      <div
        id="lp-pp-cmp-panel"
        className={`lp-pp-cmp__panelWrap${open ? ' is-open' : ''}`}
      >
        <div className="lp-pp-cmp__panel">
          <div className="lp-pp-cmp__scroll">
            <table className="lp-pp-cmp__table">
              <thead>
                <tr>
                  <th scope="col" className="lp-pp-cmp__feat">Feature</th>
                  <th scope="col">GP</th>
                  <th scope="col" className="lp-pp-cmp__rec">Specialist</th>
                  <th scope="col">All Access</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="lp-pp-cmp__feat">{r.label}</th>
                    <td><CmpCell value={r.gp} /></td>
                    <td className="lp-pp-cmp__rec"><CmpCell value={r.specialist} /></td>
                    <td><CmpCell value={r.all} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   5. FAQ
   ─────────────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: 'Is there a free trial?',
    a: 'There\u2019s no free trial. Plans are billed monthly with cancel-anytime, and the 7-day money-back guarantee covers buyer\u2019s remorse \u2014 if it\u2019s not for you, we refund.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your account at any time. No contracts, no fees.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major credit and debit cards via Lemon Squeezy. We support Visa, Mastercard, and Amex.',
  },
  {
    q: 'Can I switch between plans?',
    a: 'Yes. Upgrade or downgrade from your account at any time. Prorated billing applies.',
  },
  {
    q: 'Do prices include VAT?',
    a: 'Prices are inclusive of all applicable taxes.',
  },
]

function AccordionItem({ q, a, isOpen, onToggle, idx }) {
  const id = `lp-pp-faq-${idx}`
  return (
    <div className={`lp-faq__item${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="lp-faq__btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        id={`${id}-btn`}
      >
        <span>{q}</span>
        <span className="lp-faq__chev"><IconChevron /></span>
      </button>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="lp-faq__panelWrap">
        <div className="lp-faq__panel">
          <p>{a}</p>
        </div>
      </div>
    </div>
  )
}

function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section className="lp-faq" id="faq">
      <h2 className="lp-faq__h2">Questions, answered.</h2>
      <div className="lp-faq__list">
        {FAQS.map((f, i) => (
          <AccordionItem
            key={i}
            q={f.q}
            a={f.a}
            idx={i}
            isOpen={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   6. FINAL CTA
   ─────────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className="lp-closer lp-pp-finale">
      <div className="lp-closer__glow" aria-hidden="true" />
      <h2 className="lp-closer__h2">Still deciding?</h2>
      <p className="lp-closer__sub">
        Start with the Specialist plan. Cancel any time within 7 days for a full refund.
      </p>
      {/* Same rule as the plan-card CTAs: no solid gold pill while checkout is
          off. The final CTA matches the disabled ghost treatment until Lemon
          Squeezy ships, then can come back as a primary gold pill. */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="lp-pp-plan__cta lp-pp-plan__cta--ghost lp-pp-finale__cta"
      >
        Start Specialist
      </button>
      <p className="lp-pp-plan__soon lp-pp-finale__soon">Coming soon</p>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   7. FOOTER (matches Home.jsx)
   ─────────────────────────────────────────────────────────────── */
function FooterLanding({ navigate }) {
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
          <a href="/#features">Features</a>
          <a href="/pricing">Pricing</a>
          <button onClick={() => navigate('/login')}>Sign In</button>
        </div>
        <div className="lp-foot__col">
          <h4>Resources</h4>
          <a href="#faq">FAQ</a>
          <a href="/#credibility">About</a>
          <button onClick={() => navigate('/pricing')}>Start trial</button>
        </div>
        <div className="lp-foot__col">
          <h4>Legal</h4>
          <a href="#" onClick={(e) => e.preventDefault()}>Terms</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Privacy</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Contact</a>
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

/* ───────────────────────────────────────────────────────────────
   PAGE
   ─────────────────────────────────────────────────────────────── */
export default function Pricing() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [counts, setCounts] = useState(null) // null until loaded — drives em-dash fallback

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setUser(data?.user ?? null) })
    getProfile().then((p) => { if (!cancelled) setProfile(p) })
    fetchQuestionCounts()
      .then((c) => { if (!cancelled) setCounts(c) })
      .catch(() => { /* leave counts as null → em-dash placeholders */ })
    return () => { cancelled = true }
  }, [])

  // PRESERVED for the future Lemon Squeezy wiring. Currently unused — every
  // plan CTA renders disabled per the migration window. Do NOT delete.
  // eslint-disable-next-line no-unused-vars
  async function handleSubscribe(plan) {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { navigate('/login'); return }
    const { url, error } = await createCheckoutSession(plan.priceId, u.id, u.email)
    if (error) { alert('Failed to start checkout: ' + error); return }
    window.location.href = url
  }

  return (
    <div className="lp-root lp-pp">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <PricingNav navigate={navigate} user={user} profile={profile} />
      <Hero />
      <PricingGrid counts={counts} profile={profile} />
      <TrustRow />
      <ComparisonTable counts={counts} />
      <FAQ />
      <FinalCTA />
      <FooterLanding navigate={navigate} />
    </div>
  )
}
