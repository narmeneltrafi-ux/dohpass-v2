import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const IconCross = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

const IconPulse = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    setMessage(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else navigate('/')
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else if (data.session) navigate('/')
      else setMessage('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="aw-page">
      {/* Floating orbs — same as homepage */}
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      <div className="aw-card">
        {/* Gold top-border accent */}
        <div className="aw-top-line" />

        {/* Brand */}
        <div className="aw-brand">
          <div className="aw-brand-icon"><IconCross /></div>
          <span className="aw-brand-name">DOH<span>Pass</span></span>
        </div>

        {/* Eyebrow pill */}
        <div className="aw-eyebrow">
          <IconPulse />
          UAE Medical Licensing
        </div>

        {/* Heading */}
        <h1 className="aw-heading">
          {mode === 'login' ? 'Welcome back' : 'Get started'}
        </h1>
        <p className="aw-sub">
          {mode === 'login'
            ? 'Sign in to access your question bank'
            : 'Create your account to begin practising'}
        </p>

        {/* Divider */}
        <div className="aw-divider" />

        {/* Inputs */}
        <div className="aw-fields">
          <div className="aw-field">
            <label className="aw-label">Email address</label>
            <input
              type="email"
              className="aw-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="email"
            />
          </div>

          <div className="aw-field">
            <label className="aw-label">Password</label>
            <input
              type="password"
              className="aw-input"
              placeholder={mode === 'login' ? '••••••••' : 'Min. 6 characters'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        <button className="aw-btn" onClick={handleSubmit} disabled={loading}>
          {loading
            ? <span className="aw-btn-loading">Please wait…</span>
            : <>
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                <span className="aw-btn-icon"><IconArrow /></span>
              </>
          }
        </button>

        <div className="aw-toggle">
          {mode === 'login' ? (
            <>No account?{' '}
              <span className="aw-toggle-link" onClick={() => { setMode('signup'); setError(null); setMessage(null) }}>
                Sign Up
              </span>
            </>
          ) : (
            <>Already registered?{' '}
              <span className="aw-toggle-link" onClick={() => { setMode('login'); setError(null); setMessage(null) }}>
                Sign In
              </span>
            </>
          )}
        </div>

        <div className="aw-plans-link" onClick={() => navigate('/pricing')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          View Plans
        </div>
      </div>
    </div>
  )
}
