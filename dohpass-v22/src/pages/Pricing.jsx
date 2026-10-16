import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProfile, hasAccess } from '../lib/supabase'
import AppNav from '../components/AppNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import Accordion from '../components/site/Accordion.jsx'
import { PlanGrid, PlanTerms, PaymentSteps } from '../components/site/PlanGrid.jsx'
import useQuestionCounts from '../hooks/useQuestionCounts'
import { FAQ, fmt } from '../lib/siteContent'
import { PLANS } from '../lib/paymentConfig'
import { track } from '../lib/attribution'

/* Pricing — plans and the bank-transfer flow. Plan names, prices and the
   per-plan feature list are shared with the landing page (siteContent +
   paymentConfig), so the two can't disagree. The old Stripe price-ID wiring
   was removed: payments are manual bank transfer only. */

const IconYes = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

function Cell({ value }) {
  if (value === true) return <><IconYes /><span className="visually-hidden">Included</span></>
  if (value === false) return <><span aria-hidden="true" className="dp-cmp__no">—</span><span className="visually-hidden">Not included</span></>
  return <span className="dp-num">{value}</span>
}

function comparisonRows(counts) {
  const total = counts ? counts.gp + counts.specialist : null
  const n = (v) => fmt(v) ?? '—'
  return [
    { label: 'Questions', gp: n(counts?.gp), sp: n(counts?.specialist), all: n(total) },
    { label: 'Question bank', gp: 'GP', sp: 'Specialist', all: 'Both', repeat: true },
    { label: 'Explanations for every option', gp: true, sp: true, all: true },
    { label: 'Progress and weak-topic tracking', gp: true, sp: true, all: true },
    { label: 'Mock exams', gp: false, sp: false, all: true },
    { label: 'Flashcards', gp: false, sp: false, all: counts ? n(counts.flashcards) : true },
    { label: 'Future content', gp: false, sp: false, all: true },
    { label: 'Email support', gp: true, sp: true, all: true },
  ]
}

const PRICING_FAQ = [FAQ.payment, FAQ.methods, FAQ.refund, FAQ.switchPlan, FAQ.vat, FAQ.tryFirst]

export default function Pricing() {
  const counts = useQuestionCounts()
  const [profile, setProfile] = useState(null)

  useEffect(() => { track('pricing_view') }, [])
  useEffect(() => {
    let cancelled = false
    getProfile().then((p) => { if (!cancelled) setProfile(p) })
    return () => { cancelled = true }
  }, [])

  // Only a plan the user can actually use right now is "current".
  const currentPlan = hasAccess(profile) ? profile?.plan : null
  const rows = comparisonRows(counts)

  return (
    <div className="dp-page">
      <AppNav />
      <main id="main">
        <section className="dp-pagehead" aria-labelledby="pricing-h1">
          <div className="dp-wrap">
            <h1 className="dp-pagehead__title" id="pricing-h1">One payment, 30 days of access</h1>
            <p className="dp-pagehead__sub">
              Choose the bank for the exam you are sitting. Pay by UAE bank transfer or Wise.
              Nothing renews automatically, and your first payment has a 7-day refund.
            </p>
          </div>
        </section>

        <section className="dp-section dp-section--paper dp-section--tight on-paper" aria-label="Plans">
          <div className="dp-wrap">
            <PlanGrid counts={counts} currentPlan={currentPlan} headingLevel={2} />
            <PlanTerms />
            <div className="dp-paybox">
              <h2 className="dp-paybox__title">How paying by bank transfer works</h2>
              <PaymentSteps headingLevel={3} />
              <p className="dp-paybox__links">
                <Link to="/confirm-payment">Already paid? Confirm your transfer</Link>
                <a href="mailto:support@dohpass.com">Questions about paying? support@dohpass.com</a>
              </p>
            </div>
          </div>
        </section>

        <section className="dp-section dp-section--white on-paper" aria-labelledby="cmp-title">
          <div className="dp-wrap">
            <header className="dp-section__head">
              <h2 className="dp-h2" id="cmp-title">Compare plans</h2>
            </header>
            <div className="dp-cmp" role="region" aria-labelledby="cmp-title" tabIndex={0}>
              <table className="dp-cmp__table">
                <thead>
                  <tr>
                    <th scope="col"><span className="visually-hidden">Feature</span></th>
                    <th scope="col">GP Track</th>
                    <th scope="col">Specialist Track</th>
                    <th scope="col">All Access</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className={r.repeat ? 'dp-cmp__row--repeat' : undefined}>
                      <th scope="row">{r.label}</th>
                      <td><Cell value={r.gp} /></td>
                      <td><Cell value={r.sp} /></td>
                      <td><Cell value={r.all} /></td>
                    </tr>
                  ))}
                  <tr className="dp-cmp__price">
                    <th scope="row">Price for 30 days</th>
                    <td><span className="dp-num">AED {PLANS.gp.amount}</span></td>
                    <td><span className="dp-num">AED {PLANS.specialist.amount}</span></td>
                    <td><span className="dp-num">AED {PLANS.all_access.amount}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="dp-section dp-section--paper on-paper" aria-labelledby="pfaq-title">
          <div className="dp-wrap dp-split">
            <header className="dp-split__aside">
              <h2 className="dp-h2" id="pfaq-title">Paying and access</h2>
              <p className="dp-lede">
                Still unsure? Email <a href="mailto:support@dohpass.com">support@dohpass.com</a>.
              </p>
            </header>
            <Accordion items={PRICING_FAQ} />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  )
}
