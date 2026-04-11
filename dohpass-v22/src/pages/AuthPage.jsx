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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--card)',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div className="logo" style={{ textAlign: 'center', fontSize: '1.8rem', marginBottom: '8px' }}>
          DOH<span>Pass</span>
        </div>

        <h2 style={{ textAlign: 'center', margin: 0, color: 'var(--text)' }}>
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '1rem'
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '1rem'
          }}
        />

        {error && <div style={{ color: '#f87171', fontSize: '0.9rem' }}>{error}</div>}
        {message && <div style={{ color: '#4ade80', fontSize: '0.9rem' }}>{message}</div>}

        <button
          className="nav-cta"
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', padding: '12px', fontSize: '1rem' }}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
        </button>

        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <span
                onClick={() => setMode('signup')}
                style={{ color: 'var(--accent)', cursor: 'pointer' }}
              >Sign Up</span>
            </>
          ) : (
            <>Already have an account?{' '}
              <span
                onClick={() => setMode('login')}
                style={{ color: 'var(--accent)', cursor: 'pointer' }}
              >Sign In</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
