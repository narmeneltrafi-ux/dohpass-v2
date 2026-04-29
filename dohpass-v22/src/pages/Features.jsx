import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchQuestionCounts } from '../lib/supabase'
import LandingNav from '../components/LandingNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

/* Render `${n.toLocaleString()}+` when count is loaded, em-dash otherwise. */
function liveCount(n) {
  return n != null ? `${n.toLocaleString()}+` : '—'
}

function buildFeatures(counts) {
  const total = (counts?.specialist != null && counts?.gp != null)
    ? counts.specialist + counts.gp
    : null
  return [
    {
      id: 'questions',
      eyebrow: 'Question bank',
      title: `${liveCount(total)} questions across both tracks`,
      body: 'Specialist and GP banks are mapped to their own DOH blueprints, so you never burn time on questions outside what your exam will test.',
    },
    {
      id: 'explanations',
      eyebrow: 'Explanations',
      title: 'Clinical reasoning, not just \u201cB is correct\u201d.',
      body: 'Every answer comes with the why &mdash; right answer, wrong answers, and the guideline they trace back to. Built so you understand the case, not just memorise the option.',
    },
    {
      id: 'blueprint',
      eyebrow: 'Blueprint mapped',
      title: 'Organised exactly per the current DOH curriculum.',
      body: 'Topics line up with the official DOH blueprint, so progress in DOHPass translates directly to readiness on exam day. Updated whenever the framework changes.',
    },
    {
      id: 'mobile',
      eyebrow: 'Mobile-first',
      title: 'Study on call, on the metro, between cases.',
      body: 'Built for one-handed use on phones, with a desktop view that scales up cleanly. Your progress syncs across devices automatically.',
    },
    {
      id: 'updates',
      eyebrow: 'Weekly updates',
      title: 'New questions added every week.',
      body: 'A live queue of new vignettes &mdash; written, peer-reviewed, and pushed to the bank. You always have fresh material; no static PDF that ages out.',
    },
    {
      id: 'mock',
      eyebrow: 'Mock exams',
      title: 'Timed, exam-format, pass-mark scoring.',
      body: 'Full-length mocks that mirror the real DOH paper &mdash; 100 questions, 150 minutes, 60% pass mark. Coming with the All Access plan.',
      soon: true,
    },
    {
      id: 'flashcards',
      eyebrow: 'Flashcards',
      title: `${liveCount(counts?.flashcards)} concept and drug cards.`,
      body: 'High-yield cards across both tracks for the moments when you need to drill specifics &mdash; doses, interactions, anatomy &mdash; without committing to a full session.',
    },
  ]
}

export default function Features() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const sectionRefs = useRef([])

  useEffect(() => {
    let cancelled = false
    fetchQuestionCounts()
      .then((c) => { if (!cancelled) setCounts(c) })
      .catch(() => { /* leave null → em-dash */ })
    return () => { cancelled = true }
  }, [])

  const features = buildFeatures(counts)

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
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
  }, [features.length])

  return (
    <div className="lp-root lp-feat">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <LandingNav />

      <header className="lp-doc__hero">
        <h1 className="lp-doc__h1">Everything you need to pass.</h1>
        <p className="lp-doc__sub">
          What&rsquo;s inside DOHPass &mdash; from the question bank itself to the tools around it.
        </p>
      </header>

      <section className="lp-features lp-feat__features" aria-label="Features">
        <div className="lp-features__inner">
          <aside className="lp-spy" aria-hidden="true">
            <ul>
              {features.map((f, i) => (
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
            {features.map((f, i) => (
              <article
                key={f.id}
                ref={(el) => (sectionRefs.current[i] = el)}
                data-idx={i}
                className="lp-feature lp-feat__feature"
              >
                <div className="lp-feature__text">
                  <span className="lp-feature__eyebrow">
                    {f.eyebrow}
                    {f.soon && <span className="lp-feat__soonPill">Coming soon</span>}
                  </span>
                  <h3 className="lp-feature__title" dangerouslySetInnerHTML={{ __html: f.title }} />
                  <p className="lp-feature__body" dangerouslySetInnerHTML={{ __html: f.body }} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Closer CTA — disabled to match /pricing during the Lemon Squeezy migration */}
      <section className="lp-closer lp-feat__closer">
        <div className="lp-closer__glow" aria-hidden="true" />
        <h2 className="lp-closer__h2">Ready to start?</h2>
        <p className="lp-closer__sub">
          Pick the plan that matches your exam. Cancel any time within 7 days for a full refund.
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="lp-pp-plan__cta lp-pp-plan__cta--ghost lp-pp-finale__cta"
          onClick={() => navigate('/pricing')}
        >
          Start Specialist
        </button>
        <p className="lp-pp-plan__soon lp-pp-finale__soon">Coming soon</p>
      </section>

      <LandingFooter />
    </div>
  )
}
