import { useEffect, useState } from 'react'

/**
 * ScreenGuard — Anti-screenshot & screen-recording protection.
 *
 * Wraps content pages to prevent casual screenshotting and recording.
 * Techniques used:
 *  1. CSS: user-select: none, -webkit-touch-callout: none, pointer-events on overlay
 *  2. Block keyboard shortcuts: PrintScreen, Cmd+Shift+3/4/5 (Mac), Win+Shift+S, Ctrl+P
 *  3. Blur content on visibility change (tab switch / screen recording indicator)
 *  4. Disable right-click context menu
 *  5. Block devtools shortcuts (F12, Ctrl+Shift+I/J/C)
 *
 * NOTE: No client-side protection is 100% foolproof. These are deterrence measures.
 */
export default function ScreenGuard({ children }) {
  const [blurred, setBlurred] = useState(false)

  useEffect(() => {
    /* ── Block keyboard shortcuts ─────────────────────────────── */
    function handleKeyDown(e) {
      // PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault()
        setBlurred(true)
        setTimeout(() => setBlurred(false), 1500)
        return
      }

      // Ctrl+P (print)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        return
      }

      // Windows: Win+Shift+S (Snipping Tool) — can't fully block but we blur
      if (e.shiftKey && e.metaKey && e.key === 'S') {
        setBlurred(true)
        setTimeout(() => setBlurred(false), 2000)
        return
      }

      // Mac: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5 (screenshots)
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault()
        setBlurred(true)
        setTimeout(() => setBlurred(false), 1500)
        return
      }

      // Block devtools: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.key === 'F12') {
        e.preventDefault()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault()
        return
      }
    }

    /* ── Disable right-click ──────────────────────────────────── */
    function handleContextMenu(e) {
      e.preventDefault()
    }

    /* ── Blur on tab/window switch (recording indicator) ──────── */
    function handleVisibilityChange() {
      if (document.hidden) {
        setBlurred(true)
      } else {
        // Small delay before un-blurring to catch screenshot tools
        setTimeout(() => setBlurred(false), 300)
      }
    }

    /* ── Blur on window blur (alt-tab, screen capture overlay) ── */
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
