import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getProfile } from '../lib/supabase'

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    // Poll profile a couple times in case webhook hasn't fired yet
    let attempts = 0
    const check = async () => {
      const p = await getProfile()
      if (p?.is_paid || attempts >= 5) {
        setProfile(p)
        return
      }
      attempts++
      setTimeout(check, 2000)
    }
    check()
  }, [])

  const planLabel = {
    gp: 'GP Plan',
    specialist: 'Specialist Plan',
    all_access: 'All Access',
    free: 'Free',
  }

  return (
    <div className="ps">
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />

      <div className="ps-card">
        <div className="ps-icon">✓</div>
        <h1 className="ps-title">Payment Successful!</h1>
        <p className="ps-sub">
          {profile?.is_paid
            ? `You're now on the ${planLabel[profile.plan] || profile.plan} plan.`
            : 'Processing your subscription...'}
        </p>
        {profile && !profile.is_paid && (
          <p className="ps-note">This may take a moment. You can refresh or continue to the dashboard.</p>
        )}
        <button className="ps-cta" onClick={() => navigate('/')}>
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
