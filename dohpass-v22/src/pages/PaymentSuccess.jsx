import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getProfile } from '../lib/supabase'

const POLL_INTERVAL_MS = 1500
const MAX_ATTEMPTS = 14 // ~21s total

const planLabel = {
  gp: 'GP',
  specialist: 'Specialist',
  all_access: 'All Access',
  free: 'Free',
}

const IconCheck = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('polling') // 'polling' | 'active' | 'timeout'

  useEffect(() => {
    let cancelled = false
    let attempts = 0

    const tick = async () => {
      if (cancelled) return
      const p = await getProfile()
      if (cancelled) return
      setProfile(p)
      if (p?.is_paid) {
        setStatus('active')
        return
      }
      attempts++
      if (attempts >= MAX_ATTEMPTS) {
        setStatus('timeout')
        return
      }
      setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()

    return () => { cancelled = true }
  }, [])

  return (
    <div className="ps">
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />

      <div className="ps-card">
        <div className="ps-icon" aria-hidden="true"><IconCheck /></div>
        <h1 className="ps-title">Payment confirmed</h1>

        {status === 'polling' && (
          <p className="ps-sub">Checking your account status…</p>
        )}
        {status === 'active' && (
          <p className="ps-sub">
            {planLabel[profile?.plan] || profile?.plan} access is live. You're ready to study.
          </p>
        )}
        {status === 'timeout' && (
          <p className="ps-sub">
            Payment received. We'll activate your access within 24 hours — check your email or contact support if you have questions.
          </p>
        )}

        <button className="ps-cta" onClick={() => navigate('/dashboard')}>
          Go to dashboard
        </button>

        {sessionId && (
          <p className="ps-note">Ref: {sessionId}</p>
        )}
      </div>
    </div>
  )
}
