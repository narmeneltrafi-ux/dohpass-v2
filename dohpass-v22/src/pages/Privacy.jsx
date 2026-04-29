import { useNavigate } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

const LAST_UPDATED = 'April 29, 2026'

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: (
      <>
        <p><strong>Account data.</strong> When you sign up we collect your email address and,
          optionally, your name. If you sign in with a third-party identity provider we
          receive only the basic profile fields that provider returns.</p>
        <p><strong>Usage data.</strong> As you use the Service we record which questions you
          answer, your responses, timestamps, and progress so we can show you analytics and
          power features like spaced repetition.</p>
        <p><strong>Payment data.</strong> Payment information is collected and processed by
          our payment provider, Lemon Squeezy. We do not see or store your card details. We
          receive only a transaction reference, the plan purchased, and the billing status.</p>
      </>
    ),
  },
  {
    title: '2. How We Use Information',
    body: (
      <>
        <p>We use the information we collect to provide and improve the Service, personalise
          your study experience, send transactional emails (account confirmations, billing
          receipts, security alerts), and respond to support requests.</p>
        <p>We do not sell your personal information. We do not use your responses to train
          third-party models without your explicit, opt-in consent.</p>
      </>
    ),
  },
  {
    title: '3. Data Storage & Security',
    body: (
      <p>Your data is stored on Supabase, which uses PostgreSQL with row-level security and
        encryption at rest. Connections to the Service use TLS in transit. Access to production
        data is restricted to a small number of authorised maintainers and audited.</p>
    ),
  },
  {
    title: '4. Third-Party Services',
    body: (
      <>
        <p>We rely on the following sub-processors to operate the Service:</p>
        <ul className="lp-doc__list">
          <li><strong>Supabase</strong> &mdash; database, authentication, edge functions.</li>
          <li><strong>Vercel</strong> &mdash; web hosting and CDN.</li>
          <li><strong>Lemon Squeezy</strong> &mdash; payment processing and tax handling.</li>
        </ul>
        <p>Each sub-processor is bound by its own privacy policy, which we encourage you to
          review.</p>
      </>
    ),
  },
  {
    title: '5. Cookies & Tracking',
    body: (
      <p>We use a small number of essential cookies to keep you signed in and to remember your
        preferences. We do not use third-party advertising cookies. We may use privacy-respecting
        analytics to understand aggregate product usage; this data is not linked to your
        identity.</p>
    ),
  },
  {
    title: '6. Your Rights',
    body: (
      <>
        <p>You can request access to, correction of, or deletion of your personal data at any
          time. To exercise these rights, email us from the address associated with your
          account or use the contact form.</p>
        <p>We respond to requests within 30 days. Some data may be retained where required by
          law (for example, billing records for tax purposes).</p>
      </>
    ),
  },
  {
    title: '7. Data Retention',
    body: (
      <p>We retain your account data for as long as your account is active. If you delete your
        account, we delete or anonymise your personal data within 30 days, except where retention
        is required by applicable law.</p>
    ),
  },
  {
    title: '8. Children\u2019s Privacy',
    body: (
      <p>The Service is not intended for individuals under the age of 18. We do not knowingly
        collect personal information from children. If you believe a child has provided us with
        personal data, please contact us so we can remove it.</p>
    ),
  },
  {
    title: '9. International Transfers',
    body: (
      <p>DOHPass is operated from the United Arab Emirates. Your data may be transferred to and
        processed in jurisdictions where our sub-processors operate, including the United States
        and the European Union. We rely on standard contractual clauses or equivalent
        safeguards where required.</p>
    ),
  },
  {
    title: '10. Changes to This Policy',
    body: (
      <p>We may update this Privacy Policy from time to time. Material changes will be notified
        by email or via an in-product notice at least 14 days before they take effect.</p>
    ),
  },
  {
    title: '11. Contact',
    body: null,
  },
]

export default function Privacy() {
  const navigate = useNavigate()
  return (
    <div className="lp-root lp-doc">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <LandingNav />

      <header className="lp-doc__hero">
        <h1 className="lp-doc__h1">Privacy Policy</h1>
        <p className="lp-doc__sub">Last updated: {LAST_UPDATED}</p>
        <div className="lp-doc__draft" role="note">
          <strong>Draft template.</strong> This Privacy Policy is a working draft and will be
          reviewed by UAE legal counsel before payment activation. It does not yet form a
          binding policy.
        </div>
      </header>

      <main className="lp-doc__body">
        {SECTIONS.map((s) => (
          <section key={s.title} className="lp-doc__section">
            <h2 className="lp-doc__h2">{s.title}</h2>
            {s.body || (
              <p>
                Questions about this policy or want to exercise your data rights?{' '}
                <button type="button" className="lp-doc__link" onClick={() => navigate('/contact')}>Contact us</button>.
              </p>
            )}
          </section>
        ))}
      </main>

      <LandingFooter />
    </div>
  )
}
