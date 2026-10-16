import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase, createManualOrder, generatePaymentReference } from '../lib/supabase'
import { getPlan, BANK_DETAILS, SUPPORT_EMAIL, ACTIVATION_WINDOW } from '../lib/paymentConfig'
import { buildPlans } from '../lib/siteContent'
import useQuestionCounts from '../hooks/useQuestionCounts'
import AppNav from '../components/AppNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import { track } from '../lib/attribution'

/* Manual bank-transfer checkout. Logic is unchanged from the previous
   version (reference generated once on mount, order row inserted on
   confirm, one retry on a reference collision); this file only reorganises
   the screen around the three things a buyer must get right: the amount,
   the IBAN and the payment reference. */

const IconCheck = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

function CopyRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard unavailable — the value is still visible to copy by hand */ }
  }
  return (
    <div className="dp-copyrow">
      <dt className="dp-copyrow__label">{label}</dt>
      <dd className="dp-copyrow__value">
        <span className={mono ? 'dp-copyrow__mono' : undefined}>{value}</span>
        <button type="button" className="dp-copyrow__btn" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <><IconCheck size={14} />Copied</> : 'Copy'}
        </button>
        <span className="visually-hidden" aria-live="polite">{copied ? `${label} copied` : ''}</span>
      </dd>
    </div>
  )
}

function OrderSummary({ plan, features }) {
  return (
    <aside className="dp-order" aria-labelledby="order-title">
      <h2 className="dp-order__title" id="order-title">Your order</h2>
      <div className="dp-order__line">
        <span className="dp-order__plan">{plan.name}</span>
        <span className="dp-order__price dp-num">AED {plan.amount}</span>
      </div>
      <p className="dp-order__period">30 days of access from activation</p>
      <ul className="dp-order__list">
        {features.map((f) => <li key={f}><IconCheck size={14} />{f}</li>)}
      </ul>
      <ul className="dp-order__terms">
        <li>No subscription and no auto-renewal</li>
        <li>7-day refund on your first payment</li>
        <li>Activated within {ACTIVATION_WINDOW} of your transfer</li>
      </ul>
      <Link className="dp-order__change" to="/pricing">Change plan</Link>
    </aside>
  )
}

function Shell({ children }) {
  return (
    <div className="dp-page">
      <AppNav />
      <main id="main" className="dp-checkout on-paper">{children}</main>
      <LandingFooter />
    </div>
  )
}

export default function Checkout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const plan = getPlan(params.get('plan'))
  const counts = useQuestionCounts()
  const features = buildPlans(counts).find((p) => p.id === plan.id)?.features ?? []

  const [user, setUser] = useState(undefined) // undefined = loading, null = anon
  // Generate the reference ONCE on mount so it's stable across re-renders and
  // visible to the user before they transfer (they paste it into the memo).
  const [reference, setReference] = useState(() => generatePaymentReference())
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { track('checkout_view', { plan: plan?.id ?? null }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUser(data?.user ?? null)
    })
    return () => { cancelled = true }
  }, [])

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    let ref = reference
    let res = await createManualOrder({ amountAed: plan.amount, paymentReference: ref })
    // Astronomically rare UNIQUE collision — regenerate once and retry.
    if (res.error && /duplicate|unique/i.test(res.error?.message || String(res.error))) {
      ref = generatePaymentReference()
      setReference(ref)
      res = await createManualOrder({ amountAed: plan.amount, paymentReference: ref })
    }
    if (res.error) {
      setError(typeof res.error === 'string' ? res.error : (res.error.message || 'Your order could not be saved. Try again, or email us your transfer receipt.'))
      setSubmitting(false)
      return
    }
    track('order_placed', { plan: plan?.id ?? null, amount: plan?.amount ?? null })
    setSubmitted(true)
    setSubmitting(false)
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (user === undefined) {
    return (
      <Shell>
        <div className="dp-wrap dp-checkout__narrow">
          <p className="dp-checkout__loading" role="status">Loading checkout…</p>
        </div>
      </Shell>
    )
  }

  /* ── Not signed in — gate into auth, preserving intent ───── */
  if (user === null) {
    return (
      <Shell>
        <div className="dp-wrap dp-checkout__narrow">
          <h1 className="dp-checkout__title">Sign in to buy {plan.name}</h1>
          <p className="dp-checkout__sub">
            {plan.name} is AED {plan.amount} for 30 days. Access is added to your account, so sign in
            or create a free account first.
          </p>
          <div className="dp-checkout__actions">
            <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/login')}>
              Sign in or create account
            </button>
            <Link className="dp-checkout__link" to="/pricing">Back to pricing</Link>
          </div>
        </div>
      </Shell>
    )
  }

  /* ── Confirmation ────────────────────────────────────────── */
  if (submitted) {
    return (
      <Shell>
        <div className="dp-wrap dp-checkout__narrow">
          <p className="dp-checkout__done-icon" aria-hidden="true"><IconCheck size={22} /></p>
          <h1 className="dp-checkout__title">Order saved</h1>
          <p className="dp-checkout__sub">Two things left, and your access is switched on.</p>
          <ol className="dp-checklist">
            <li>
              <h2>Use your reference in the transfer memo</h2>
              <p>Your reference is <strong className="dp-copyrow__mono">{reference}</strong>. It is how we match the payment to your account.</p>
            </li>
            <li>
              <h2>Email us the receipt</h2>
              <p>
                Send a screenshot or confirmation to{' '}
                <a href={`mailto:${SUPPORT_EMAIL}?subject=DOHPass%20payment%20${reference}`}>{SUPPORT_EMAIL}</a>{' '}
                with the reference in the subject.
              </p>
            </li>
            <li>
              <h2>We activate {plan.name}</h2>
              <p>Within {ACTIVATION_WINDOW} of the transfer reaching us.</p>
            </li>
          </ol>
          <div className="dp-checkout__actions">
            <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  /* ── Checkout ────────────────────────────────────────────── */
  const showSwift = BANK_DETAILS.swift && !/REPLACE_ME/.test(BANK_DETAILS.swift)
  const showAccountNumber = BANK_DETAILS.accountNumber && !/REPLACE_ME/.test(BANK_DETAILS.accountNumber)
  const currency = BANK_DETAILS.currency || 'AED'

  return (
    <Shell>
      <div className="dp-wrap dp-checkout__grid">
        <div className="dp-checkout__main">
          <h1 className="dp-checkout__title">Pay for {plan.name} by bank transfer</h1>
          <p className="dp-checkout__sub">
            Transfer {currency} {plan.amount} from any UAE bank account or Wise, then tell us below.
          </p>

          <ol className="dp-paysteps">
            <li className="dp-paysteps__item">
              <h2 className="dp-paysteps__title"><span aria-hidden="true">1</span>Copy your payment reference</h2>
              <div className="dp-refbox">
                <dl className="dp-copylist">
                  <CopyRow label="Payment reference" value={reference} mono />
                </dl>
                <p className="dp-refbox__hint">Put this in the transfer memo exactly as shown. It is how we match the payment to your account.</p>
              </div>
            </li>

            <li className="dp-paysteps__item">
              <h2 className="dp-paysteps__title"><span aria-hidden="true">2</span>Send the transfer to this account</h2>
              <p className="dp-warn">
                <IconShield />
                <span>
                  Only pay the account shown on this page while signed in at dohpass.com. We never send
                  different bank details by email, WhatsApp or direct message.
                </span>
              </p>
              <dl className="dp-copylist">
                <CopyRow label="Amount" value={`${currency} ${plan.amount}`} />
                <CopyRow label="Account name" value={BANK_DETAILS.accountName} />
                <CopyRow label="Bank" value={BANK_DETAILS.bankName} />
                <CopyRow label="IBAN" value={BANK_DETAILS.iban} mono />
                {showAccountNumber && <CopyRow label="Account number" value={BANK_DETAILS.accountNumber} mono />}
                {showSwift && <CopyRow label="SWIFT / BIC" value={BANK_DETAILS.swift} mono />}
              </dl>
            </li>

            <li className="dp-paysteps__item">
              <h2 className="dp-paysteps__title"><span aria-hidden="true">3</span>Tell us you have paid</h2>
              <p className="dp-paysteps__body">
                This saves your order. Then email the receipt to{' '}
                <a href={`mailto:${SUPPORT_EMAIL}?subject=DOHPass%20payment%20${reference}`}>{SUPPORT_EMAIL}</a>{' '}
                and we activate your access within {ACTIVATION_WINDOW}.
              </p>
              {error && <p className="dp-error" role="alert">{error}</p>}
              <div className="dp-checkout__actions">
                <button type="button" className="btn btn--primary btn--lg" onClick={handleConfirm} disabled={submitting} aria-busy={submitting}>
                  {submitting ? <><span className="btn__spinner" aria-hidden="true" />Saving your order…</> : 'I’ve sent the transfer'}
                </button>
                <Link className="dp-checkout__link" to="/confirm-payment">Paid earlier? Confirm a transfer</Link>
              </div>
            </li>
          </ol>
        </div>

        <OrderSummary plan={plan} features={features} />
      </div>
    </Shell>
  )
}
