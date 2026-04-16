import { useEffect, useState } from 'react'

/**
 * ScreenGuard — Anti-screenshot & screen-recording protection.
 * Wraps content pages to deter casual screenshotting and recording.
 */
export default function ScreenGuard({ children }) {
  const [blurred, setBlurred] = useState(false)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'PrintScreen') {
        e.preventDefault()
        setBlurred(true)
        setTimeout(() => setBlurred(false), 1500)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        return
      }
      if (e.shiftKey && e.metaKey && e.key === 'S') {
        setBlurred(true)
        setTimeout(() => setBlurred(false), 2000)
        return
      }
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        setBlurred(true)
        setTimeout(() => setBlurred(false), 1500)
        return
      }
      if (e.key === 'F12') {
        e.preventDefault()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault()
        return
      }
    }

    function handleContextMenu(e) {
      e.preventDefault()
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        setBlurred(true)
      } else {
        setTimeout(() => setBlurred(false), 300)
      }
    }

    function handleWindowBlur() {
      setBlurred(true)
    }

    function handleWindowFocus() {
      setTimeout(() => setBlurred(false), 300)
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
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
