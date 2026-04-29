import { useState } from 'react'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

const IconMail = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
)
const IconPin = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
)
const IconClock = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
)
const IconCheck = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

// Placeholder until founder confirms a final inbox.
const SUPPORT_EMAIL = 'support@dohpass.com'

export default function Contact() {
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [message, setMsg]   = useState('')
  const [sent, setSent]     = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) return
    setSubmitting(true)
    // UI-only for now — wiring to a real email/inbox service is a separate
    // task. Logged here so a developer running locally can verify the
    // payload they would send.
    // eslint-disable-next-line no-console
    console.log('[contact form draft]', { name, email, message })
    setTimeout(() => {
      setSent(true)
      setSubmitting(false)
    }, 350) // tiny delay so the UI doesn't flash instantly
  }

  return (
    <div className="lp-root lp-contact">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <LandingNav />

      <header className="lp-doc__hero">
        <h1 className="lp-doc__h1">Get in touch</h1>
        <p className="lp-doc__sub">
          Questions, feedback, or need help? We respond within 24 hours.
        </p>
      </header>

      <main className="lp-contact__grid">
        <aside className="lp-contact__card" aria-label="Contact details">
          <ul className="lp-contact__list">
            <li>
              <span className="lp-contact__icon"><IconMail /></span>
              <div>
                <div className="lp-contact__label">Email</div>
                <a className="lp-contact__value" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </div>
            </li>
            <li>
              <span className="lp-contact__icon"><IconPin /></span>
              <div>
                <div className="lp-contact__label">Founder</div>
                <div className="lp-contact__value">Dr. Ibrahim &middot; Tawam Hospital, Al Ain, UAE</div>
              </div>
            </li>
            <li>
              <span className="lp-contact__icon"><IconClock /></span>
              <div>
                <div className="lp-contact__label">Response time</div>
                <div className="lp-contact__value">Within 24 hours, Sunday&ndash;Thursday (UAE time)</div>
              </div>
            </li>
          </ul>
        </aside>

        <section className="lp-contact__formCard" aria-labelledby="contact-form-title">
          <h2 className="lp-contact__formTitle" id="contact-form-title">Send a message</h2>

          {sent ? (
            <div className="lp-contact__success" role="status" aria-live="polite">
              <span className="lp-contact__successIcon"><IconCheck /></span>
              <div>
                <div className="lp-contact__successTitle">Thanks &mdash; message received.</div>
                <p>We&rsquo;ll respond within 24 hours.</p>
              </div>
            </div>
          ) : (
            <form className="lp-contact__form" onSubmit={handleSubmit} noValidate>
              <label className="lp-contact__field">
                <span>Name</span>
                <input
                  type="text"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </label>
              <label className="lp-contact__field">
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="lp-contact__field">
                <span>Message</span>
                <textarea
                  name="message"
                  rows={6}
                  value={message}
                  onChange={(e) => setMsg(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="lp-contact__submit"
                disabled={submitting || !name.trim() || !email.trim() || !message.trim()}
              >
                {submitting ? 'Sending\u2026' : 'Send message'}
              </button>
            </form>
          )}
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
