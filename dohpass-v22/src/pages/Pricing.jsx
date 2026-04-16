import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, getProfile, createCheckoutSession } from '../lib/supabase'

const PLANS = [
  {
    id: 'gp',
    name: 'GP Plan',
    price: '49',
    currency: 'AED',
    period: '/month',
    priceId: 'price_1TMjzp9oYokhs2iDMYKAdc6c',
    features: [
      'Full GP question bank (988 questions)',
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
    priceId: 'price_1TMk0W9oYokhs2iDmzZxIyTh',
    features: [
      'Full Specialist question bank (756 questions)',
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
    priceId: 'price_1TMk1L9oYokhs2iDnwA0yLuX',
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

export default function Pricing() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(null) // which plan is loading

  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

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
    <div className="pr">
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      <nav className="hw-nav">
        <div className="hw-nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="hw-nav-cross">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="9" y="2" width="6" height="20" rx="2" />
              <rect x="2" y="9" width="20" height="6" rx="2" />
            </svg>
          </span>
          <span className="hw-nav-brand">DOH<span>Pass</span></span>
        </div>
        <button className="pr-back" onClick={() => navigate('/')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </nav>

      <div className="pr-hero">
        <h1 className="pr-title">Choose Your Plan</h1>
        <p className="pr-sub">Unlock unlimited access to high-yield DOH exam questions</p>
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
                disabled={isCurrentPlan || loading !== null}
                onClick={() => handleSubscribe(plan)}
              >
                {loading === plan.id
                  ? 'Redirecting...'
                  : isCurrentPlan
                    ? 'Current Plan'
                    : 'Subscribe'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
