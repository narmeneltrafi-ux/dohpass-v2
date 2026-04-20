import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getProfile, createPortalSession } from '../lib/supabase'

const planLabel = {
  gp: 'GP',
  specialist: 'Specialist',
  all_access: 'All Access',
  free: 'Free',
}

function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return null
  }
}

export default function Account() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(undefined) // undefined = loading
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getProfile().then(p => {
      if (!cancelled) setProfile(p ?? null)
    })
    return () => { cancelled = true }
  }, [])

  async function handleManageSubscription() {
    setPortalLoading(true)
    setPortalError(null)
    const { url, error } = await createPortalSession()
    if (error) {
      setPortalError(error)
      setPortalLoading(false)
      return
    }
    if (url) {
      window.location.href = url
      // page navigates away; don't clear loading
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (profile === undefined) {
    return (
      <div className="account">
        <div className="account-card">
          <p className="account-muted">Loading…</p>
        </div>
      </div>
    )
  }

  if (profile === null) {
    return (
      <div className="account">
        <div className="account-card">
          <p className="account-muted">Please log in to view your account.</p>
          <button className="account-btn account-btn--primary" onClick={() => navigate('/login')}>
            Log in
          </button>
        </div>
      </div>
    )
  }

  const isPaid = Boolean(profile.is_paid && profile.stripe_customer_id)
  const cancelsAtPeriodEnd = Boolean(profile.cancel_at_period_end)
  const periodEnd = formatDate(profile.current_period_end)

  return (
    <div className="account">
      <div className="account-card">
        <h1 className="account-title">Account</h1>

        <div className="account-row">
          <span className="account-label">Email</span>
          <span className="account-value">{profile.email || '—'}</span>
        </div>

        {isPaid ? (
          <>
            <div className="account-row">
              <span className="account-label">Current plan</span>
              <span className="account-value">{planLabel[profile.plan] || profile.plan}</span>
            </div>

            {periodEnd && (
              <div className="account-row">
                <span className="account-label">
                  {cancelsAtPeriodEnd ? 'Access ends on' : 'Next billing'}
                </span>
                <span className="account-value">{periodEnd}</span>
              </div>
            )}

            {cancelsAtPeriodEnd && periodEnd && (
              <div className="account-notice">
                Your subscription is scheduled to end on {periodEnd}. You'll keep access until then.
              </div>
            )}

            <button
              className="account-btn account-btn--primary"
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              {portalLoading ? 'Redirecting…' : 'Manage Subscription'}
            </button>
            {portalError && <p className="account-error">{portalError}</p>}
          </>
        ) : (
          <>
            <div className="account-row">
              <span className="account-label">Current plan</span>
              <span className="account-value">Free</span>
            </div>
            <p className="account-muted">
              You're on the free tier (limited to 10 questions). Upgrade to unlock full access.
            </p>
            <button
              className="account-btn account-btn--primary"
              onClick={() => navigate('/pricing')}
            >
              See plans
            </button>
          </>
        )}

        <div className="account-footer">
          <button className="account-btn account-btn--secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
