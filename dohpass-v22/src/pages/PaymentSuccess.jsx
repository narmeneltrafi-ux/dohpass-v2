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
        <div className="ps-icon">✓</div>
        <h1 className="ps-title">Payment Successful!</h1>

        {status === 'polling' && (
          <p className="ps-sub">Processing your subscription...</p>
        )}
        {status === 'active' && (
          <p className="ps-sub">
            Subscription active! Plan: {planLabel[profile?.plan] || profile?.plan}
          </p>
        )}
        {status === 'timeout' && (
          <p className="ps-sub">
            Payment received — if you don't see access in a minute, please refresh or contact support.
          </p>
        )}

        <button
          className="ps-cta"
          onClick={() => navigate('/')}
          disabled={status === 'polling'}
        >
          Go to Dashboard
        </button>

        {sessionId && (
          <p className="ps-note" style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '1rem' }}>
            Ref: {sessionId}
          </p>
        )}
      </div>
    </div>
  )
}
