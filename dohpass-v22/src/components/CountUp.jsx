import { useEffect, useRef, useState } from 'react'

// Animated number counter that fires the count-up the first time the element
// scrolls into view. Renders an em-dash when value is null/undefined so that
// reserved space stays the same, preventing CLS while data loads.
export default function CountUp({ value, durationMs = 1400, suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (value == null) return
    const node = ref.current
    if (!node) return
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !startedRef.current) {
          startedRef.current = true
          const start = performance.now()
          const target = Number(value) || 0
          const tick = (now) => {
            const t = Math.min(1, (now - start) / durationMs)
            const eased = 1 - Math.pow(1 - t, 3)
            setDisplay(Math.round(eased * target))
            if (t < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      })
    }, { threshold: 0.4 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [value, durationMs])

  return (
    <span ref={ref} className="lp-countup">
      {value == null ? '—' : `${display.toLocaleString()}${suffix}`}
    </span>
  )
}
