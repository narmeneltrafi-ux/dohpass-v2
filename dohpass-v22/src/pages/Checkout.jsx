import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase, createManualOrder, generatePaymentReference } from '../lib/supabase'
import { getPlan, BANK_DETAILS, SUPPORT_EMAIL, ACTIVATION_WINDOW } from '../lib/paymentConfig'
import AppNav from '../components/AppNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

const IconArrow = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const IconCheck = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconShield = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconWarning = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const PLAN_FEATURES = {
  gp:         ['GP question bank · DOH GP blueprint', 'Clinical explanations + guideline citations', '30 days full access — no subscription'],
  specialist: ['3,000+ specialist questions', 'DOH 2026 Specialist blueprint · All specialties', '30 days full access — no subscription'],
  all_access: ['GP + Specialist question banks', 'Flashcards included · All future content', '30 days full access — no subscription'],
}

/* Small copy-to-clipboard row used for bank fields + reference. */
function CopyRow({ label, value, mono }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — value is still visible to copy by hand */ }
  }
  return (
    <div className="bt-row">
      <div className="bt-row__main">
        <span className="bt-row__label">{label}</span>
        <span className={`bt-row__value${mono ? ' bt-row__value--mono' : ''}`}>{value}</span>
      </div>
      <button type="button" className="bt-copy" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export default function Checkout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const plan = getPlan(params.get('plan'))

  const [user, setUser] = useState(undefined) // undefined = loading, null = anon
  // Generate the reference ONCE on mount so it's stable across re-renders and
  // visible to the user before they transfer (they paste it into the memo).
  const [reference, setReference] = useState(() => generatePaymentReference())
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

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
      setError(typeof res.error === 'string' ? res.error : (res.error.message || 'Something went wrong. Please try again.'))
      setSubmitting(false)
      return
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  const orbs = (
    <>
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />
    </>
  )

  /* ── Loading ─────────────────────────────────────────────── */
  if (user === undefined) {
    return (
      <div className="lp-root lp-pp">
        {orbs}
        <AppNav />
        <div className="bt-page"><div className="bt-card"><p className="bt-muted">Loading…</p></div></div>
      </div>
    )
  }

  /* ── Not signed in — gate into auth, preserving intent ───── */
  if (user === null) {
    return (
      <div className="lp-root lp-pp">
        {orbs}
        <AppNav />
        <div className="bt-page">
          <div className="bt-card bt-card--narrow">
            <h1 className="bt-h1">Create your account to continue</h1>
            <p className="bt-sub">
              You're buying the <strong>{plan.name}</strong> plan (AED {plan.amount}/month).
              Sign in or create a free account first — it takes a few seconds.
            </p>
            <button className="aw-btn" onClick={() => navigate('/login')}>
              <span>Sign in / Sign up</span>
              <span className="aw-btn-icon"><IconArrow /></span>
            </button>
          </div>
        </div>
        <LandingFooter />
      </div>
    )
  }

  /* ── Confirmation state ──────────────────────────────────── */
  if (submitted) {
    return (
      <div className="lp-root lp-pp">
        {orbs}
        <AppNav />
        <div className="bt-page">
          <div className="bt-card bt-card--narrow bt-card--center">
            <div className="bt-tick"><IconCheck size={26} /></div>
            <h1 className="bt-h1">Transfer recorded</h1>
            <p className="bt-sub">
              We&apos;ve saved your order. Two more steps and you&apos;re in.
            </p>

            <div className="bt-divider" />

            <h2 className="bt-h2">What to do now</h2>
            <ol className="bt-timeline">
              <li>
                <span className="bt-timeline__dot">1</span>
                <div>
                  Include your reference <strong>{reference}</strong> in the transfer memo — it&apos;s how we match your payment.
                </div>
              </li>
              <li>
                <span className="bt-timeline__dot">2</span>
                <div>
                  Email your transfer screenshot or confirmation to{' '}
                  <a className="bt-link" href={`mailto:${SUPPORT_EMAIL}?subject=DOHPass%20payment%20${reference}`}>{SUPPORT_EMAIL}</a>
                  {' '}with the reference in the subject line.
                </div>
              </li>
              <li>
                <span className="bt-timeline__dot">3</span>
                <div>
                  We&apos;ll activate <strong>{plan.name}</strong> on your account within {ACTIVATION_WINDOW}.
                </div>
              </li>
            </ol>

            <div className="bt-divider" />

            <button className="aw-btn" onClick={() => navigate('/dashboard')}>
              <span>Go to dashboard</span>
              <span className="aw-btn-icon"><IconArrow /></span>
            </button>
          </div>
        </div>
        <LandingFooter />
      </div>
    )
  }

  /* ── Checkout ────────────────────────────────────────────── */
  const showSwift = BANK_DETAILS.swift && !/REPLACE_ME/.test(BANK_DETAILS.swift)
  const showAccountNumber = BANK_DETAILS.accountNumber && !/REPLACE_ME/.test(BANK_DETAILS.accountNumber)
  const currency = BANK_DETAILS.currency || 'AED'
  return (
    <div className="lp-root lp-pp">
      {orbs}
      <AppNav />
      <div className="bt-page">
        <div className="bt-card">
          <span className="bt-eyebrow">Bank transfer · UAE local payment</span>
          <h1 className="bt-h1">Get {plan.name}</h1>

          {/* Plan summary */}
          <div className="bt-plan">
            <div className="bt-plan__info">
              <div className="bt-plan__name">{plan.name}</div>
              <div className="bt-plan__bullets">
                {(PLAN_FEATURES[plan.id] || []).map(f => (
                  <div className="bt-plan__bullet" key={f}>
                    <span className="bt-plan__bullet-icon"><IconCheck size={10} /></span>
                    {f}
                  </div>
                ))}
              </div>
            </div>
            <div className="bt-plan__price">
              <span className="bt-plan__cur">AED</span>
              <span className="bt-plan__num">{plan.amount}</span>
              <span className="bt-plan__per">/ 30 days</span>
            </div>
          </div>
          <p className="bt-plan__note">One payment · No subscription · No auto-renew · Renew anytime.</p>

          {/* What happens next */}
          <div className="bt-divider" />
          <h2 className="bt-h2">What happens next</h2>
          <ol className="bt-timeline">
            <li><span className="bt-timeline__dot">1</span><div><strong>Transfer the amount</strong> to the account below, using your unique reference.</div></li>
            <li><span className="bt-timeline__dot">2</span><div><strong>Email your proof</strong> of payment to <a className="bt-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</div></li>
            <li><span className="bt-timeline__dot">3</span><div><strong>We activate your access</strong> — usually within {ACTIVATION_WINDOW}. You'll be ready to study.</div></li>
          </ol>

          {/* Bank details */}
          <div className="bt-divider" />
          <h2 className="bt-h2">Bank details</h2>

          <div className="bt-warn" role="alert">
            <span className="bt-warn__icon" aria-hidden="true"><IconWarning size={16} /></span>
            <p className="bt-warn__text">
              Only transfer to the IBAN shown on this page, after signing in at dohpass.com.
              We will <strong>never</strong> send you different bank details by email, WhatsApp, or DM.
              Always include your payment reference in the transfer memo.
            </p>
          </div>

          <div className="bt-fields">
            <CopyRow label="Account name" value={BANK_DETAILS.accountName} />
            <CopyRow label="Bank" value={BANK_DETAILS.bankName} />
            {showAccountNumber && <CopyRow label="Account number" value={BANK_DETAILS.accountNumber} mono />}
            <CopyRow label="IBAN" value={BANK_DETAILS.iban} mono />
            {showSwift && <CopyRow label="SWIFT / BIC" value={BANK_DETAILS.swift} mono />}
            <CopyRow label="Amount" value={`${currency} ${plan.amount}`} />
          </div>

          {/* Unique reference */}
          <div className="bt-refbox bt-refbox--accent">
            <span className="bt-refbox__label">Use this as your payment reference / memo</span>
            <CopyRow label="Payment reference" value={reference} mono />
            <span className="bt-refbox__hint">This lets us match your transfer to your account. Please don't change it.</span>
          </div>

          {/* Reassurance */}
          <div className="bt-trust">
            <span className="bt-trust__icon"><IconShield /></span>
            <span>No subscription · No auto-renew · 7-day money-back guarantee</span>
          </div>

          {error && <div className="auth-error">{error}</div>}

          {/* Single primary action */}
          <button className="aw-btn bt-cta" onClick={handleConfirm} disabled={submitting}>
            {submitting
              ? <span className="aw-btn-loading">Saving…</span>
              : <><span>I've made the transfer</span><span className="aw-btn-icon"><IconArrow /></span></>
            }
          </button>
          <p className="bt-finehint">
            Tap this once you've sent the transfer. You can also email proof to{' '}
            <a className="bt-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> anytime.
          </p>
          <p className="bt-finehint">
            <Link className="bt-link" to="/confirm-payment">Already paid? Confirm here →</Link>
          </p>
        </div>
      </div>
      <LandingFooter />
    </div>
  )
}
