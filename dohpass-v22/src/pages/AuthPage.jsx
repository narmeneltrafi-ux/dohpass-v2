import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">DOH<span>Pass</span></div>
        <p className="auth-title">
          {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
        </p>

        <input
          type="email"
          className="auth-input"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={handleKey}
          autoComplete="email"
        />

        <input
          type="password"
          className="auth-input"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKey}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        <button className="auth-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div className="auth-toggle">
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <span className="auth-toggle-link" onClick={() => setMode('signup')}>Sign Up</span>
            </>
          ) : (
            <>Already have an account?{' '}
              <span className="auth-toggle-link" onClick={() => setMode('login')}>Sign In</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
