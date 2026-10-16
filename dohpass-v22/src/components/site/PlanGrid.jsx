import { useNavigate } from 'react-router-dom'
import { buildPlans, PLAN_TERMS, PAYMENT_STEPS } from '../../lib/siteContent'

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

/* Three plans with equal visual weight — the right plan is whichever exam
   the candidate sits, so nothing is pushed as "recommended". Prices come
   from paymentConfig; counts from the live RPC (passed in as `counts`). */
export function PlanGrid({ counts, currentPlan = null, headingLevel = 3 }) {
  const navigate = useNavigate()
  const plans = buildPlans(counts)
  const H = `h${headingLevel}`
  return (
    <div className="dp-plans">
      {plans.map((p) => {
        const isCurrent = currentPlan === p.id
        return (
          <article className="dp-plan" key={p.id} aria-labelledby={`plan-${p.id}`}>
            <H className="dp-plan__name" id={`plan-${p.id}`}>{p.name}</H>
            <p className="dp-plan__for">{p.audience}</p>
            <p className="dp-plan__price">
              <span className="dp-plan__cur">AED</span>
              <span className="dp-plan__num">{p.amount}</span>
              <span className="dp-plan__per">for 30 days</span>
            </p>
            <ul className="dp-plan__list">
              {p.features.map((f) => (
                <li key={f}><IconCheck />{f}</li>
              ))}
            </ul>
            {isCurrent ? (
              <button type="button" className="btn btn--quiet btn--block" disabled>
                Your current plan
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ink btn--block"
                onClick={() => navigate(`/checkout?plan=${p.id}`)}
              >
                Choose {p.name}
              </button>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function PlanTerms() {
  return (
    <ul className="dp-terms" aria-label="Terms that apply to every plan">
      {PLAN_TERMS.map((t) => <li key={t}>{t}</li>)}
    </ul>
  )
}

/* The bank-transfer flow is a real sequence, so it is numbered. */
export function PaymentSteps({ headingLevel = 3 }) {
  const H = `h${headingLevel}`
  return (
    <ol className="dp-steps">
      {PAYMENT_STEPS.map((s, i) => (
        <li className="dp-steps__item" key={s.title}>
          <span className="dp-steps__n" aria-hidden="true">{i + 1}</span>
          <H className="dp-steps__title">{s.title}</H>
          <p className="dp-steps__body">{s.body}</p>
        </li>
      ))}
    </ol>
  )
}
