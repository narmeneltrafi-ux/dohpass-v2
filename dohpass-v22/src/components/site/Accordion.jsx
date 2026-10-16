import { useId, useState } from 'react'

/* Accessible disclosure list (WAI-ARIA accordion pattern): each heading
   holds a real <button> with aria-expanded/aria-controls; panels are
   labelled regions. Items open independently so readers can compare. */
export default function Accordion({ items, headingLevel = 3, defaultOpen = -1 }) {
  const base = useId()
  const [open, setOpen] = useState(() => new Set(defaultOpen >= 0 ? [defaultOpen] : []))
  const H = `h${headingLevel}`

  function toggle(i) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="acc">
      {items.map((item, i) => {
        const isOpen = open.has(i)
        const btnId = `${base}-b${i}`
        const panelId = `${base}-p${i}`
        return (
          <div className="acc__item" key={item.q}>
            <H className="acc__h">
              <button
                type="button"
                id={btnId}
                className="acc__btn"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(i)}
              >
                <span className="acc__q">{item.q}</span>
                <span className="acc__icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
              </button>
            </H>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              className="acc__panel"
              data-open={isOpen}
              inert={isOpen ? undefined : ''}
            >
              <div><p>{item.a}</p></div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
