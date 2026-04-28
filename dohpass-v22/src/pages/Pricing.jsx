import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, getProfile, createCheckoutSession, fetchQuestionCounts } from '../lib/supabase'

const PRICE_GP         = import.meta.env.VITE_STRIPE_PRICE_GP;
const PRICE_SPECIALIST = import.meta.env.VITE_STRIPE_PRICE_SPECIALIST;
const PRICE_ALL_ACCESS = import.meta.env.VITE_STRIPE_PRICE_ALL_ACCESS;
if (!PRICE_GP || !PRICE_SPECIALIST || !PRICE_ALL_ACCESS) {
  console.error("Pricing: missing VITE_STRIPE_PRICE_* env vars");
}

function buildPlans(counts) {
  return [
    {
      id: 'gp',
      name: 'GP Plan',
      price: '49',
      currency: 'AED',
      period: '/month',
      priceId: PRICE_GP,
      features: [
        `Full GP question bank (${counts.gp.toLocaleString()} questions)`,
        'Unlimited practice sessions',
        'Progress tracking',
        'Detailed explanations',
      ],
      variant: 'blue',
      icon: '🩺',
    },
    {
      id: 'specialist',
      name: 'Specialist Plan',
      price: '69',
      currency: 'AED',
      period: '/month',
      priceId: PRICE_SPECIALIST,
      features: [
        `Full Specialist question bank (${counts.specialist.toLocaleString()} questions)`,
        'Unlimited practice sessions',
        'Progress tracking',
        'Detailed explanations',
      ],
      variant: 'gold',
      icon: '🏅',
      popular: true,
    },
    {
      id: 'all_access',
      name: 'All Access',
      price: '89',
      currency: 'AED',
      period: '/month',
      priceId: PRICE_ALL_ACCESS,
      features: [
        'Both GP & Specialist question banks',
        'Unlimited practice sessions',
        'Priority progress tracking',
        'Flashcards included',
        'All future content',
      ],
      variant: 'all',
      icon: '👑',
    },
  ]
}

export default function Pricing() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(null) // which plan is loading
  const [counts, setCounts] = useState({ specialist: 0, gp: 0 })

  useEffect(() => {
    getProfile().then(setProfile)
    fetchQuestionCounts().then(setCounts)
  }, [])

  const PLANS = buildPlans(counts)

  async function handleSubscribe(plan) {
    setLoading(plan.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }

      const { url, error } = await createCheckoutSession(
        plan.priceId,
        user.id,
        user.email
      )

      if (error) {
        alert('Failed to start checkout: ' + error)
        setLoading(null)
        return
      }

      window.location.href = url
    } catch (err) {
      alert('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  const currentPlan = profile?.plan || 'free'

  return (
    <div className="pr" style={{ paddingTop: '62px' }}>
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      <div className="pr-hero">
        <h1 className="pr-title">Choose Your Plan</h1>
        <p className="pr-sub">Unlock unlimited access to high-yield DOH exam questions</p>
      </div>

      <div
        role="status"
        style={{
          maxWidth: '720px',
          margin: '0 auto 2.25rem',
          padding: '14px 22px',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.10), rgba(212,175,55,0.04))',
          border: '1px solid rgba(212,175,55,0.28)',
          borderRadius: '10px',
          textAlign: 'center',
          fontFamily: "'Playfair Display', serif",
          fontSize: '1rem',
          color: '#D4AF37',
          letterSpacing: '0.02em',
        }}
      >
        Early access launching shortly.
      </div>

      <div className="pr-grid">
        {PLANS.map((plan) => {
          const isCurrentPlan = currentPlan === plan.id
          const isUpgrade = currentPlan === 'free' || (!isCurrentPlan && currentPlan !== 'all_access')

          return (
            <div key={plan.id} className={`pr-card pr-card--${plan.variant}${plan.popular ? ' pr-card--popular' : ''}`}>
              {plan.popular && <div className="pr-card-badge">Most Popular</div>}
              <div className="pr-card-icon">{plan.icon}</div>
              <h2 className="pr-card-name">{plan.name}</h2>
              <div className="pr-card-price">
                <span className="pr-card-currency">{plan.currency}</span>
                <span className="pr-card-amount">{plan.price}</span>
                <span className="pr-card-period">{plan.period}</span>
              </div>
              <ul className="pr-card-features">
                {plan.features.map((f, i) => (
                  <li key={i}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`pr-card-cta pr-card-cta--${plan.variant}`}
                disabled
                aria-disabled="true"
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              >
                {isCurrentPlan ? 'Current Plan' : 'Coming Soon'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
