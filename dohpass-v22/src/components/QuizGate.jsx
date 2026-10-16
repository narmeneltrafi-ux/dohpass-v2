import { Link, useNavigate } from 'react-router-dom'
import { PLANS, ACTIVATION_WINDOW } from '../lib/paymentConfig'
import { authPath } from '../lib/postAuthRedirect'
import useQuestionCounts from '../hooks/useQuestionCounts'
import { fmt } from '../lib/siteContent'

/* The screens that stop a question session: the anonymous preview cap, the
   end of the free 10, and a paid plan that doesn't include this bank.
   These are the moments someone decides whether to sign up or pay, so each
   one says plainly what they get, what it costs and what happens next.
   Every fact here is real: prices from paymentConfig, counts from the live
   RPC, terms as published on /pricing. Routing is unchanged from the old
   PaywallGate except that sign-up now returns the person to this track. */

const TRACKS = {
  specialist: { title: 'Internal Medicine Specialist', bank: 'Specialist' },
  gp:         { title: 'General Practitioner',         bank: 'GP' },
}

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function Offer({ plan, items }) {
  return (
    <div className="qgate__offer">
      <p className="qgate__price">
        <span className="qgate__plan">{plan.name}</span>
        <span className="qgate__amount"><span className="qgate__cur">AED</span> {plan.amount}</span>
        <span className="qgate__per">for 30 days</span>
      </p>
      <ul className="qgate__terms">
        {items.map((t) => <li key={t}><IconCheck />{t}</li>)}
      </ul>
    </div>
  )
}

export default function QuizGate({ variant, track }) {
  const navigate = useNavigate()
  const counts = useQuestionCounts()
  const t = TRACKS[track] || TRACKS.specialist
  const plan = PLANS[track] || PLANS.specialist
  const count = fmt(counts?.[track])
  const here = `/${track}`
  const signedIn = variant === 'trial-used' || variant === 'wrong-plan'

  let title, body, offer = null, primary, secondary

  if (variant === 'preview-limit' || variant === 'preview-done') {
    title = variant === 'preview-done' ? 'Preview complete' : 'That’s the end of the free preview'
    body = `Create a free account to answer 10 more ${t.bank} questions, each with a full explanation. No payment details needed.`
    primary = { label: 'Create a free account', to: authPath({ next: here, signup: true }) }
    secondary = { label: 'I have an account — sign in', to: authPath({ next: here }) }
  } else if (variant === 'wrong-plan') {
    title = `The ${t.bank} bank isn’t in your plan`
    body = `Your current plan doesn’t include the ${t.bank} bank. Add it on its own, or get both banks with All Access for AED ${PLANS.all_access.amount}.`
    offer = (
      <Offer
        plan={plan}
        items={[
          count ? `${count} ${t.bank} questions with full explanations` : `The full ${t.bank} question bank`,
          'One bank transfer — nothing renews automatically',
          `Switched on within ${ACTIVATION_WINDOW} of your transfer`,
        ]}
      />
    )
    primary = { label: `Get ${plan.name}`, to: `/checkout?plan=${plan.id}` }
    secondary = { label: 'Compare plans', to: '/pricing' }
  } else {
    // trial-used
    title = 'You’ve used your 10 free questions'
    body = `Keep going with the full ${t.bank} bank — the same option-by-option explanations, with your progress and weak topics tracked as you go.`
    offer = (
      <Offer
        plan={plan}
        items={[
          count ? `All ${count} ${t.bank} questions` : `The full ${t.bank} question bank`,
          'One bank transfer — nothing renews automatically',
          '7-day refund on your first payment',
          'Your answers so far stay in your progress',
        ]}
      />
    )
    primary = { label: `Get ${plan.name} — AED ${plan.amount}`, to: `/checkout?plan=${plan.id}` }
    secondary = { label: 'Compare plans', to: '/pricing' }
  }

  return (
    <div className="qui-page">
      <div className="qui-stickyhead">
        <div className="qui-topbar">
          <button
            className="qui-back"
            type="button"
            onClick={() => navigate(signedIn ? '/dashboard' : '/')}
            aria-label={signedIn ? 'Back to dashboard' : 'Back to home'}
          >
            <IconArrowLeft />
            <span className="qui-back__label">{signedIn ? 'Dashboard' : 'Home'}</span>
          </button>
          <div className="qui-counter">{t.title}</div>
          <span aria-hidden="true" />
        </div>
      </div>

      <main className="qgate" id="main">
        <h1 className="qgate__title">{title}</h1>
        <p className="qgate__body">{body}</p>
        {offer}
        <div className="qgate__actions">
          <button type="button" className="btn btn--primary btn--lg qgate__cta" onClick={() => navigate(primary.to)}>
            {primary.label}
          </button>
          <Link className="qgate__link" to={secondary.to}>{secondary.label}</Link>
        </div>
      </main>
    </div>
  )
}
