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
            <span className="screen-guard__icon">🔒</span>
            <p>Content protected</p>
          </div>
        </div>
      )}
    </div>
  )
}
