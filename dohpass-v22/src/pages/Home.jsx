import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLandingStats } from '../lib/supabase'
import CountUp from '../components/CountUp.jsx'
import ShinyBorderButton from '../components/ShinyBorderButton.jsx'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

/* ───────────────────────────────────────────────────────────────
   ICONS
   ─────────────────────────────────────────────────────────────── */
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
const IconChevron = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

/* ───────────────────────────────────────────────────────────────
   PRIMITIVES
   ─────────────────────────────────────────────────────────────── */

/* Hand-drawn underline SVG, sits behind a word in the headline */
function HandUnderline() {
  return (
    <svg className="lp-underline" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M5 14 Q 70 4 150 11 T 295 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ───────────────────────────────────────────────────────────────
   2. HERO
   ─────────────────────────────────────────────────────────────── */
function Hero({ navigate, scrollToFeatures }) {
  return (
    <section className="lp-hero" id="hero">
      <div className="lp-hero__grid" aria-hidden="true" />

      <div className="lp-hero__inner">
        <div className="lp-hero__badge">
          <span className="lp-hero__pulse" />
          DOH 2026 exam ready · Updated weekly
        </div>

        <h1 className="lp-hero__h1">
          Pass your DOH exam with
          <br />
          <span className="lp-hero__h1-gold">
            confidence
            <HandUnderline />
          </span>
        </h1>

        <p className="lp-hero__sub">
          3,000+ specialist questions. 1,000+ GP questions. Written and reviewed by UAE physicians,
          mapped to the current DOH blueprint.
        </p>

        <div className="lp-hero__ctas">
          <ShinyBorderButton onClick={() => navigate('/pricing')}>
            Start Free Trial <IconArrow />
          </ShinyBorderButton>
          <button className="lp-ghost" onClick={scrollToFeatures}>
            See a sample question <IconArrow />
          </button>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   3. LIVE STATS BAR
   ─────────────────────────────────────────────────────────────── */
function StatsBar({ stats }) {
  function formatUpdated(d) {
    if (!d) return 'today'
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return 'today'
    const diffDays = Math.floor((now - d) / 86400000)
    if (diffDays <= 6) return `${diffDays}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const cells = [
    { label: 'Questions Live', value: stats?.questions, suffix: '+' },
    { label: 'Specialties',    value: stats?.specialties },
    { label: 'Explanations',   value: stats?.explanations, suffix: '+' },
  ]

  return (
    <div className="lp-stats" role="region" aria-label="Live question bank stats">
      {cells.map((c, i) => (
        <div className="lp-stats__cell" key={i}>
          <span className="lp-stats__label">{c.label}</span>
          <span className="lp-stats__num">
            <CountUp value={c.value ?? null} suffix={c.suffix || ''} />
          </span>
        </div>
      ))}
      <div className="lp-stats__cell">
        <span className="lp-stats__label">Updated</span>
        <span className="lp-stats__num lp-stats__num--word">
          {formatUpdated(stats?.lastUpdated)}
        </span>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   4. FEATURES — SCROLL-SPY (LIGHT)
   ─────────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    id: 'tracks',
    eyebrow: 'Two tracks, one path',
    title: 'GP and Specialist — pick the track that matches your exam.',
    body: 'Each bank is mapped to its own DOH blueprint, so you never waste time on questions that won\'t be tested.',
    Mock: MockTracks,
  },
  {
    id: 'realistic',
    eyebrow: 'Real exam-style questions',
    title: 'Pearson-VUE-style vignettes, single best answer.',
    body: 'No filler MCQs. Each question is a clinical scenario built to match the format and pacing of the live DOH exam.',
    Mock: MockQuestion,
  },
  {
    id: 'explanations',
    eyebrow: 'In-depth explanations',
    title: 'Every answer comes with a guideline-cited rationale.',
    body: 'Why the right answer is right, why each distractor is wrong, and which guideline it traces back to.',
    Mock: MockExplanation,
  },
  {
    id: 'mobile',
    eyebrow: 'Mobile-first',
    title: 'Practice on call, on the metro, between cases.',
    body: 'The whole interface is built for one-handed use on phones, with a desktop view that scales up cleanly.',
    Mock: MockMobile,
  },
  {
    id: 'daily',
    eyebrow: 'Daily new questions',
    title: 'Fresh questions added weekly, reviewed by physicians.',
    body: 'A live queue of new vignettes — written, peer-reviewed, and pushed to the bank without you having to refresh.',
    Mock: MockDaily,
  },
]

function FeaturesSection() {
  const [activeIdx, setActiveIdx] = useState(0)
  const sectionRefs = useRef([])

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      // pick the entry whose center is closest to the viewport center
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length === 0) return
      const winMid = window.innerHeight / 2
      let best = visible[0]
      let bestDist = Infinity
      visible.forEach((e) => {
        const r = e.target.getBoundingClientRect()
        const mid = r.top + r.height / 2
        const dist = Math.abs(mid - winMid)
        if (dist < bestDist) { bestDist = dist; best = e }
      })
      const idx = Number(best.target.dataset.idx)
      if (!Number.isNaN(idx)) setActiveIdx(idx)
    }, { threshold: [0.3, 0.5, 0.7] })

    sectionRefs.current.forEach((el) => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <section className="lp-features" id="features" aria-label="Features">
      <div className="lp-features__inner">
        <aside className="lp-spy" aria-hidden="true">
          <ul>
            {FEATURES.map((f, i) => (
              <li
                key={f.id}
                className={`lp-spy__item${i === activeIdx ? ' lp-spy__item--active' : ''}`}
              >
                <span className="lp-spy__dot" />
                <span className="lp-spy__label">{f.eyebrow}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="lp-features__col">
          {FEATURES.map((f, i) => {
            const Mock = f.Mock
            return (
              <article
                key={f.id}
                ref={(el) => (sectionRefs.current[i] = el)}
                data-idx={i}
                className="lp-feature"
              >
                <div className="lp-feature__text">
                  <span className="lp-feature__eyebrow">{f.eyebrow}</span>
                  <h3 className="lp-feature__title">{f.title}</h3>
                  <p className="lp-feature__body">{f.body}</p>
                </div>
                <div className="lp-feature__visual">
                  <Mock />
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ── Static JSX mockups for the feature visuals ───────────────── */
function MockTracks() {
  return (
    <div className="lp-mock lp-mock--tracks">
      <div className="lp-mock__card lp-mock__card--gold">
        <div className="lp-mock__cardTop">
          <span className="lp-mock__pill lp-mock__pill--gold">Specialist</span>
          <span className="lp-mock__count">3,000+ Q</span>
        </div>
        <div className="lp-mock__rows">
          <span>Cardiology</span><span>Respiratory</span><span>Nephrology</span>
        </div>
      </div>
      <div className="lp-mock__card lp-mock__card--blue">
        <div className="lp-mock__cardTop">
          <span className="lp-mock__pill lp-mock__pill--blue">GP</span>
          <span className="lp-mock__count">1,000+ Q</span>
        </div>
        <div className="lp-mock__rows">
          <span>Primary Care</span><span>Pediatrics</span><span>Women&apos;s Health</span>
        </div>
      </div>
    </div>
  )
}

function MockQuestion() {
  return (
    <div className="lp-mock lp-mock--question">
      <div className="lp-mock__qTop">
        <span className="lp-mock__pill lp-mock__pill--soft">Cardiology · Vignette</span>
        <span className="lp-mock__qIdx">Q 14 / 50</span>
      </div>
      <p className="lp-mock__stem">
        A 68-year-old man with hypertension presents with central chest pain radiating to the left arm
        for 40 minutes. ECG shows ST elevation in leads II, III, and aVF. What is the single best
        next step?
      </p>
      <ul className="lp-mock__opts">
        <li><span className="lp-mock__opt-key">A</span>Aspirin 300mg only</li>
        <li className="is-correct"><span className="lp-mock__opt-key">B</span>Primary PCI within 90 minutes</li>
        <li><span className="lp-mock__opt-key">C</span>Thrombolysis with streptokinase</li>
        <li><span className="lp-mock__opt-key">D</span>CT pulmonary angiogram</li>
      </ul>
    </div>
  )
}

function MockExplanation() {
  return (
    <div className="lp-mock lp-mock--exp">
      <div className="lp-mock__expHead">
        <span className="lp-mock__expBadge">Correct: B</span>
        <span className="lp-mock__expSrc">ESC STEMI Guidelines 2023</span>
      </div>
      <p className="lp-mock__expBody">
        Inferior STEMI within the 12-hour window mandates primary PCI as the reperfusion strategy of
        choice when available within 120 minutes of first medical contact. Thrombolysis is reserved
        for centres without timely PCI access.
      </p>
      <ul className="lp-mock__expWhy">
        <li><b>A</b> — antiplatelet alone does not reperfuse.</li>
        <li><b>C</b> — only if PCI not available in window.</li>
        <li><b>D</b> — wrong vascular territory.</li>
      </ul>
    </div>
  )
}

function MockMobile() {
  return (
    <div className="lp-mock lp-mock--mobile">
      <div className="lp-phone">
        <div className="lp-phone__notch" />
        <div className="lp-phone__screen">
          <div className="lp-phone__bar">
            <span>Q 27</span><span>4 / 5 streak</span>
          </div>
          <p className="lp-phone__q">Which antibiotic is first-line for uncomplicated UTI in a non-pregnant adult?</p>
          <div className="lp-phone__opts">
            <span>Nitrofurantoin</span>
            <span>Amoxicillin</span>
            <span>Ciprofloxacin</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockDaily() {
  return (
    <div className="lp-mock lp-mock--daily">
      <div className="lp-mock__feed">
        {[
          { tag: 'New', topic: 'Endocrine', when: 'Today' },
          { tag: 'New', topic: 'Renal',     when: 'Today' },
          { tag: 'Reviewed', topic: 'GI',   when: 'Yesterday' },
          { tag: 'Reviewed', topic: 'Cardio', when: '2d ago' },
        ].map((r, i) => (
          <div className="lp-mock__feedRow" key={i}>
            <span className={`lp-mock__feedTag${r.tag === 'New' ? ' is-new' : ''}`}>{r.tag}</span>
            <span className="lp-mock__feedTopic">{r.topic}</span>
            <span className="lp-mock__feedWhen">{r.when}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────
   5. CREDIBILITY BAR
   ─────────────────────────────────────────────────────────────── */
function CredibilityBar() {
  return (
    <section className="lp-cred" id="credibility">
      <h2 className="lp-cred__h2">Built by UAE physicians, for UAE physicians</h2>
      <div className="lp-cred__card">
        <div className="lp-cred__avatar" aria-label="Founder portrait placeholder">DI</div>
        <div className="lp-cred__body">
          <div className="lp-cred__name">Dr. Ibrahim</div>
          <div className="lp-cred__title">
            Oncology &amp; Palliative Care SHO · Tawam Hospital, Al Ain
          </div>
          <p className="lp-cred__quote">
            &ldquo;Built from the questions I wished I&apos;d had during my own DOH prep.&rdquo;
          </p>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   6. PRICING TEASER
   ─────────────────────────────────────────────────────────────── */
const PRICING = [
  {
    id: 'gp',
    name: 'GP',
    price: '49',
    features: [
      '1,000+ GP questions',
      'Full DOH GP blueprint',
      'Detailed explanations',
      'Cancel anytime',
    ],
  },
  {
    id: 'specialist',
    name: 'Specialist',
    price: '69',
    features: [
      '3,000+ Specialist questions',
      'Full DOH Specialist blueprint',
      'Detailed explanations',
      'Cancel anytime',
    ],
  },
  {
    id: 'all',
    name: 'All Access',
    price: '89',
    recommended: true,
    features: [
      'Both GP & Specialist banks',
      'Flashcards included',
      'All future content',
      'Priority new questions',
    ],
  },
]

function PricingTeaser({ navigate }) {
  return (
    <section className="lp-pricing" id="pricing">
      <h2 className="lp-pricing__h2">Simple pricing. Real results.</h2>
      <p className="lp-pricing__sub">All plans monthly. Cancel anytime.</p>
      <div className="lp-pricing__grid">
        {PRICING.map((p) => (
          <article
            key={p.id}
            className={`lp-plan${p.recommended ? ' lp-plan--rec' : ''}`}
          >
            {p.recommended && <span className="lp-plan__rec">Recommended</span>}
            <h3 className="lp-plan__name">{p.name}</h3>
            <div className="lp-plan__price">
              <span className="lp-plan__cur">AED</span>
              <span className="lp-plan__num">{p.price}</span>
              <span className="lp-plan__per">/mo</span>
            </div>
            <ul className="lp-plan__feats">
              {p.features.map((f) => (
                <li key={f}>
                  <span className="lp-plan__check"><IconCheck /></span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              className={`lp-plan__cta${p.recommended ? ' lp-plan__cta--gold' : ''}`}
              onClick={() => navigate('/pricing')}
            >
              Choose {p.name}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   7. TESTIMONIALS — placeholder (do not fabricate)
   ─────────────────────────────────────────────────────────────── */
const SHOW_TESTIMONIALS = false  // flip to true once real quotes arrive

function Testimonials() {
  if (!SHOW_TESTIMONIALS) {
    return (
      <section className="lp-tm" id="testimonials" aria-label="Testimonials placeholder">
        <h2 className="lp-tm__h2">What physicians are saying</h2>
        <p className="lp-tm__pending">
          Real testimonials from candidates currently using DOHPass — coming soon.
        </p>
        <div className="lp-tm__skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lp-tm__sk">
              <div className="lp-tm__sk-line" style={{ width: '92%' }} />
              <div className="lp-tm__sk-line" style={{ width: '78%' }} />
              <div className="lp-tm__sk-line" style={{ width: '64%' }} />
              <div className="lp-tm__sk-foot">
                <span className="lp-tm__sk-avatar" />
                <div>
                  <div className="lp-tm__sk-name" />
                  <div className="lp-tm__sk-role" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }
  return null
}

/* ───────────────────────────────────────────────────────────────
   8. FAQ
   ─────────────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: 'Is DOHPass aligned with the latest DOH blueprint?',
    a: 'Yes. Every question is mapped to the current DOH-HAAD blueprint and reviewed when the framework is updated.',
  },
  {
    q: 'How often are questions updated?',
    a: 'New vignettes are added weekly. Existing questions are revised whenever a guideline changes or a reviewer flags an update.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Plans are billed monthly and you can cancel from your account page in one click. Access continues until the end of your billing period.',
  },
  {
    q: 'Is there a free trial?',
    a: 'You can sample questions before subscribing. The full bank unlocks after you choose a plan.',
  },
  {
    q: 'GP vs Specialist track — which one?',
    a: 'Pick the bank that matches the exam you are sitting. If you are taking both, All Access bundles them at a lower combined price.',
  },
]

function AccordionItem({ q, a, isOpen, onToggle, idx }) {
  const id = `lp-faq-${idx}`
  return (
    <div className={`lp-faq__item${isOpen ? ' is-open' : ''}`}>
      <button
        className="lp-faq__btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        id={`${id}-btn`}
      >
        <span>{q}</span>
        <span className="lp-faq__chev"><IconChevron /></span>
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-btn`}
        className="lp-faq__panelWrap"
      >
        <div className="lp-faq__panel">
          <p>{a}</p>
        </div>
      </div>
    </div>
  )
}

function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section className="lp-faq" id="faq">
      <h2 className="lp-faq__h2">Questions, answered.</h2>
      <div className="lp-faq__list">
        {FAQS.map((f, i) => (
          <AccordionItem
            key={i}
            q={f.q}
            a={f.a}
            idx={i}
            isOpen={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   9. CTA CLOSER
   ─────────────────────────────────────────────────────────────── */
function CTACloser({ navigate }) {
  return (
    <section className="lp-closer" id="cta">
      <div className="lp-closer__glow" aria-hidden="true" />
      <h2 className="lp-closer__h2">Ready to pass?</h2>
      <p className="lp-closer__sub">Start your free trial. No card required.</p>
      <ShinyBorderButton
        className="lp-closer__btn"
        onClick={() => navigate('/pricing')}
      >
        Start Free Trial <IconArrow size={18} />
      </ShinyBorderButton>
      <p className="lp-closer__small">Join physicians preparing across the UAE.</p>
    </section>
  )
}

/* ───────────────────────────────────────────────────────────────
   PAGE
   ─────────────────────────────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchLandingStats().then((s) => { if (!cancelled) setStats(s) })
    return () => { cancelled = true }
  }, [])

  const scrollToFeatures = useCallback(() => {
    const el = document.getElementById('features')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="lp-root">
      {/* Floating orbs (kept from existing brand, opacity dialed down) */}
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <LandingNav />

      <Hero navigate={navigate} scrollToFeatures={scrollToFeatures} />

      <div className="lp-statswrap">
        <StatsBar stats={stats} />
      </div>

      <FeaturesSection />

      <CredibilityBar />

      <PricingTeaser navigate={navigate} />

      <Testimonials />

      <FAQ />

      <CTACloser navigate={navigate} />

      <LandingFooter />
    </div>
  )
}
