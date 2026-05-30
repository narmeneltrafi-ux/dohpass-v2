import { useEffect, useState } from 'react'

/**
 * ScreenGuard — light screenshot deterrent for PAID content only.
 * Mounted only for users with access (see GuardedContent in App.jsx).
 * Only reacts to actual screenshot key combos — never to tab-switch,
 * window blur, or devtools, so it never false-fires on normal use.
 */
export default function ScreenGuard({ children }) {
  const [blurred, setBlurred] = useState(false)

  useEffect(() => {
    function flash(ms) {
      setBlurred(true)
      setTimeout(() => setBlurred(false), ms)
    }

    function handleKeyDown(e) {
      if (e.key === 'PrintScreen') {
        flash(1500)
        return
      }
      if (e.shiftKey && e.metaKey && e.key === 'S') {
        flash(2000)
        return
      }
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        flash(1500)
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [])

  return (
    <div className={`screen-guard${blurred ? ' screen-guard--blurred' : ''}`}>
      {children}
      {blurred && (
        <div className="screen-guard__overlay">
          <div className="screen-guard__message">
            <span className="screen-guard__icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <p>Content protected</p>
          </div>
        </div>
      )}
    </div>
  )
}
