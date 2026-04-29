import { useNavigate } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

const LAST_UPDATED = 'April 29, 2026'

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: (
      <>
        <p>By accessing or using DOHPass (the &ldquo;Service&rdquo;), you agree to be bound by
          these Terms of Service and our Privacy Policy. If you do not agree, do not use the
          Service.</p>
        <p>You must be at least 18 years old and have the legal capacity to enter into a
          binding agreement to use the Service.</p>
      </>
    ),
  },
  {
    title: '2. Description of Service',
    body: (
      <p>DOHPass is a subscription-based medical exam preparation platform offering question
        banks, explanations, and study tools mapped to the Department of Health (DOH) Abu Dhabi
        licensing examinations. The Service is provided on a software-as-a-service basis and
        is intended for individual study use.</p>
    ),
  },
  {
    title: '3. Account Registration',
    body: (
      <>
        <p>To access most features you must create an account. You agree to provide accurate
          and current information and to keep your credentials confidential. You are responsible
          for all activity under your account.</p>
        <p>One account per person. Sharing accounts or login credentials is prohibited and
          may result in account termination without refund.</p>
      </>
    ),
  },
  {
    title: '4. Subscriptions & Billing',
    body: (
      <>
        <p>Access to paid content is provided on a monthly subscription basis. Subscriptions
          renew automatically each billing period until cancelled. You may cancel at any time
          from your account; cancellation takes effect at the end of the current period.</p>
        <p>We offer a 7-day money-back guarantee for first-time subscribers. If the Service is
          not for you, contact us within 7 days of your first payment for a full refund.</p>
        <p>Prices are listed in AED and are inclusive of all applicable taxes unless stated
          otherwise. Payments are processed by our third-party payment provider.</p>
      </>
    ),
  },
  {
    title: '5. User Conduct',
    body: (
      <>
        <p>You agree not to: copy, scrape, or redistribute the question bank or explanations;
          use the Service to develop a competing product; reverse-engineer or attempt to
          circumvent any access controls; or use the Service in any way that violates
          applicable law.</p>
        <p>Violations may result in immediate suspension or termination of your account
          without refund.</p>
      </>
    ),
  },
  {
    title: '6. Intellectual Property',
    body: (
      <p>All questions, explanations, illustrations, and other content on the Service are the
        property of DOHPass or its licensors and are protected by copyright and other
        intellectual-property laws. You receive a personal, non-transferable, non-exclusive
        license to use the content for your own study while your subscription is active.</p>
    ),
  },
  {
    title: '7. Disclaimers',
    body: (
      <>
        <p><strong>Educational use only.</strong> DOHPass is a study aid and does not constitute
          medical advice. Clinical decisions must be made on the basis of current guidelines,
          patient context, and your own professional judgement.</p>
        <p><strong>No guarantee of exam outcome.</strong> While our content is mapped to the
          current DOH blueprint and reviewed by UAE-based physicians, we make no guarantee
          that you will pass any examination. Exam results depend on many factors outside of
          our control.</p>
        <p>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, express or implied.</p>
      </>
    ),
  },
  {
    title: '8. Limitation of Liability',
    body: (
      <p>To the maximum extent permitted by applicable law, DOHPass and its officers, employees,
        and contributors shall not be liable for any indirect, incidental, special, consequential,
        or punitive damages, or any loss of profits or revenues, arising out of or in connection
        with your use of the Service. Our aggregate liability shall not exceed the amount you
        paid to us in the twelve months preceding the claim.</p>
    ),
  },
  {
    title: '9. Governing Law',
    body: (
      <p>These Terms are governed by the laws of the United Arab Emirates. Any dispute arising
        from or related to these Terms or the Service shall be subject to the exclusive
        jurisdiction of the courts of Abu Dhabi.</p>
    ),
  },
  {
    title: '10. Changes to These Terms',
    body: (
      <p>We may update these Terms from time to time. Material changes will be notified by
        email or via an in-product notice at least 14 days before they take effect. Continued
        use of the Service after the effective date constitutes acceptance of the updated
        Terms.</p>
    ),
  },
  {
    title: '11. Contact',
    body: null, // rendered with link below
  },
]

export default function Terms() {
  const navigate = useNavigate()
  return (
    <div className="lp-root lp-doc">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <LandingNav />

      <header className="lp-doc__hero">
        <h1 className="lp-doc__h1">Terms of Service</h1>
        <p className="lp-doc__sub">Last updated: {LAST_UPDATED}</p>
        <div className="lp-doc__draft" role="note">
          <strong>Draft template.</strong> These Terms are a working draft and will be reviewed
          by UAE legal counsel before payment activation. They do not yet form a binding
          agreement.
        </div>
      </header>

      <main className="lp-doc__body">
        {SECTIONS.map((s) => (
          <section key={s.title} className="lp-doc__section">
            <h2 className="lp-doc__h2">{s.title}</h2>
            {s.body || (
              <p>
                Questions about these Terms? <button type="button" className="lp-doc__link" onClick={() => navigate('/contact')}>Contact us</button>.
              </p>
            )}
          </section>
        ))}
      </main>

      <LandingFooter />
    </div>
  )
}
