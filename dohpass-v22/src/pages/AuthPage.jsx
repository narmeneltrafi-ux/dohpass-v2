import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { track, getFirstTouch, getAnonId } from '../lib/attribution'
import BrandMark from '../components/BrandMark.jsx'

// Where Supabase sends users after they click the email-confirmation link.
// This URL MUST be present in the Supabase dashboard redirect allowlist
// (Authentication → URL Configuration → Redirect URLs) or the link 404s.
const EMAIL_REDIRECT_URL = 'https://dohpass.com/dashboard'

const IconCheckSmall = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function AuthPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState(params.get('mode') === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  // Post-signup confirmation state: true once a confirmation email is sent and
  // we're waiting for the user to click the link.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  useEffect(() => { if (mode === 'signup') track('signup_view') }, [mode])
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (loading) return
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else navigate('/')
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: EMAIL_REDIRECT_URL,
          // First-touch attribution travels with the account (auth user_metadata).
          data: { first_touch: getFirstTouch(), anon_id: getAnonId() },
        },
      })
      if (!error) track('signup_submitted', { confirm_required: !data?.session })
      if (error) setError(error.message)
      else if (data.session) navigate('/dashboard')  // new account → first-run hero (pick exam, 10 free Qs)
      else setAwaitingConfirm(true)                  // confirmation required → show confirm screen
    }
    setLoading(false)
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    setResent(false)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: EMAIL_REDIRECT_URL },
    })
    if (error) setError(error.message)
    else setResent(true)
    setResending(false)
  }

  function backToForm(nextMode) {
    setAwaitingConfirm(false)
    setResent(false)
    setError(null)
    setMessage(null)
    if (nextMode) setMode(nextMode)
  }

  async function handleReset() {
    if (!email) { setError('Enter your email address above, then tap Forgot password.'); return }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: EMAIL_REDIRECT_URL })
    setLoading(false)
    if (error) setError(error.message)
    else setResetSent(true)
  }

  return (
    <div className="aw-page">
      <main className="aw-card" id="main">
        <Link to="/" className="aw-brand" aria-label="DOHPass home">
          <BrandMark size={28} />
          <span className="aw-brand-name" aria-hidden="true">DOH<span>Pass</span></span>
        </Link>

        {awaitingConfirm ? (
          <>
            <h1 className="aw-heading">Confirm your email</h1>
            <p className="aw-sub">
              We sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account and start practising.
            </p>

            <div className="aw-divider" />

            <ol className="aw-steps">
              <li>Open the email from DOHPass (check spam/junk too).</li>
              <li>Tap <strong>Confirm your email</strong> in that message.</li>
              <li>You'll land back here, signed in and ready to go.</li>
            </ol>

            {error && <div className="auth-error" role="alert">{error}</div>}
            {resent && <div className="auth-success" role="status">Confirmation email sent again.</div>}

            <button type="button" className="aw-btn" onClick={handleResend} disabled={resending}>
              {resending
                ? <span className="aw-btn-loading">Sending…</span>
                : <span>Send the confirmation email again</span>
              }
            </button>

            <div className="aw-toggle">
              Wrong address?{' '}
              <button type="button" className="aw-toggle-link" onClick={() => backToForm('signup')}>
                Use a different email
              </button>
            </div>

            <div className="aw-toggle">
              Already confirmed?{' '}
              <button type="button" className="aw-toggle-link" onClick={() => backToForm('login')}>
                Sign in
              </button>
            </div>
          </>
        ) : (
        <>
        {/* Heading */}
        <h1 className="aw-heading">
          {mode === 'login' ? 'Sign in to DOHPass' : 'Create your free account'}
        </h1>
        <p className="aw-sub">
          {mode === 'login'
            ? 'Pick up where you left off.'
            : '10 practice questions with full explanations. No payment details needed.'}
        </p>

        {mode === 'signup' && (
          <div className="aw-trust" role="list" aria-label="What you get with DOHPass">
            <div className="aw-trust__item" role="listitem">
              <span className="aw-trust__icon"><IconCheckSmall /></span>
              Questions for the DOH Specialist and GP exams
            </div>
            <div className="aw-trust__item" role="listitem">
              <span className="aw-trust__icon"><IconCheckSmall /></span>
              Every option explained, with references
            </div>
            <div className="aw-trust__item" role="listitem">
              <span className="aw-trust__icon"><IconCheckSmall /></span>
              7-day money-back guarantee on your first payment
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="aw-divider" />

        <form onSubmit={handleSubmit}>
        <div className="aw-fields">
          <div className="aw-field">
            <label className="aw-label" htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              className="aw-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>

          <div className="aw-field">
            <label className="aw-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="aw-input"
              placeholder={mode === 'login' ? '' : 'At least 6 characters'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signup' ? 6 : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'auth-error' : undefined}
            />
            {mode === 'signup' && <span className="aw-hint">At least 6 characters.</span>}
          </div>
        </div>

        {mode === 'login' && !resetSent && (
          <button type="button" className="aw-forgot" onClick={handleReset} disabled={loading}>
            Forgot password?
          </button>
        )}
        {resetSent && (
          <div className="auth-success" role="status">Reset link sent. Check your email.</div>
        )}

        {error && <div className="auth-error" id="auth-error" role="alert">{error}</div>}
        {message && <div className="auth-success" role="status">{message}</div>}

        <button type="submit" className="aw-btn" disabled={loading} aria-busy={loading}>
          {loading
            ? <><span className="btn__spinner" aria-hidden="true" /><span className="aw-btn-loading">{mode === 'login' ? 'Signing in…' : 'Creating your account…'}</span></>
            : <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
          }
        </button>
        </form>

        <div className="aw-toggle">
          {mode === 'login' ? (
            <>No account?{' '}
              <button type="button" className="aw-toggle-link" onClick={() => { setMode('signup'); setError(null); setMessage(null) }}>
                Create one free
              </button>
            </>
          ) : (
            <>Already registered?{' '}
              <button type="button" className="aw-toggle-link" onClick={() => { setMode('login'); setError(null); setMessage(null) }}>
                Sign in
              </button>
            </>
          )}
        </div>

        <Link className="aw-plans-link" to="/pricing">See plans and pricing</Link>
        </>
        )}
      </main>
    </div>
  )
}
