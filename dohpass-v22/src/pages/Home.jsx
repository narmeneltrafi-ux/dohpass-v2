import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AppNav from '../components/AppNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import SampleQuestionDemo, { ANATOMY_QUESTION } from '../components/SampleQuestionDemo.jsx'
import Accordion from '../components/site/Accordion.jsx'
import { PlanGrid, PlanTerms, PaymentSteps } from '../components/site/PlanGrid.jsx'
import useQuestionCounts from '../hooks/useQuestionCounts'
import { FAQ, SPECIALIST_SYSTEMS, GP_SYSTEMS, fmt } from '../lib/siteContent'
import { track } from '../lib/attribution'

/* ───────────────────────────────────────────────────────────────
   Landing page. One idea carries it: the product shows itself.
   The hero's right column is a real, answerable question; every
   section after it is evidence for a claim the hero makes.
   Live numbers come from get_question_counts (one call, shared).
   ─────────────────────────────────────────────────────────────── */

function Count({ value }) {
  // Fixed-width placeholder while loading so nothing shifts.
  return <span className="dp-num">{value ?? '—'}</span>
}

function Hero({ onStart, total }) {
  return (
    <section className="dp-hero" aria-labelledby="hero-title">
      <div className="dp-wrap">
        <h1 className="dp-hero__title" id="hero-title">
          <span>Your DOH exam is specific.</span> <span>Your prep should be too.</span>
        </h1>
        <div className="dp-hero__grid">
        <div className="dp-hero__copy">
          <p className="dp-hero__sub">
            Single-best-answer practice questions for the DOH Internal Medicine Specialist
            and GP exams. Each answer is explained option by option, with the guideline
            behind it where one applies.
          </p>
          <div className="dp-hero__actions">
            <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
              Start free
            </button>
            <a className="dp-hero__try" href="#sample">Try a sample question</a>
          </div>
          <p className="dp-hero__note">
            10 questions free when you sign up. No payment details needed.
          </p>
          <div className="dp-byline">
            <span className="dp-byline__mono" aria-hidden="true">DI</span>
            <p>
              Built by <strong>Dr. Ibrahim</strong>, DOH-licensed Internal Medicine
              Specialist, MRCP&nbsp;(UK), Tawam Hospital.
            </p>
          </div>
        </div>
        <div className="dp-hero__sheet" id="sample">
          <SampleQuestionDemo totalQuestions={total} />
        </div>
        </div>
      </div>
    </section>
  )
}

function ExamPanel({ id, title, count, systems, to, cta }) {
  return (
    <article className="dp-exam" id={id} aria-labelledby={`${id}-title`}>
      <h3 className="dp-exam__title" id={`${id}-title`}>{title}</h3>
      <p className="dp-exam__count"><Count value={count} /> questions</p>
      <p className="dp-exam__desc">
        Clinical vignettes in the Pearson VUE style. One best answer from four or five options.
      </p>
      <h4 className="dp-exam__label">Systems with the most questions</h4>
      <ul className="dp-exam__systems">
        {systems.slice(0, 9).map((s) => <li key={s}>{s}</li>)}
        <li className="dp-exam__more">and more</li>
      </ul>
      <div className="dp-exam__cta">
        <Link className="btn btn--quiet" to={to}>{cta}</Link>
        <span className="dp-exam__note">No account needed</span>
      </div>
    </article>
  )
}

function Exams({ counts }) {
  return (
    <section className="dp-section dp-section--paper on-paper" aria-labelledby="exams-title">
      <div className="dp-wrap">
        <header className="dp-section__head">
          <h2 className="dp-h2" id="exams-title">Two exams, two separate banks</h2>
          <p className="dp-lede">
            Each bank is organised around its own DOH exam, so your time goes on material you
            will actually be tested on.
          </p>
        </header>
        <div className="dp-exams">
          <ExamPanel
            id="specialist"
            title="Internal Medicine Specialist"
            count={fmt(counts?.specialist)}
            systems={SPECIALIST_SYSTEMS}
            to="/specialist"
            cta="Try Specialist questions"
          />
          <ExamPanel
            id="gp"
            title="General Practitioner"
            count={fmt(counts?.gp)}
            systems={GP_SYSTEMS}
            to="/gp"
            cta="Try GP questions"
          />
        </div>
      </div>
    </section>
  )
}

function Anatomy() {
  const q = ANATOMY_QUESTION
  const answer = q.options.find((o) => o.key === q.correct)
  return (
    <section className="dp-section dp-section--white on-paper" aria-labelledby="anatomy-title">
      <div className="dp-wrap dp-split">
        <header className="dp-split__aside">
          <h2 className="dp-h2" id="anatomy-title">Explanations that teach the decision</h2>
          <p className="dp-lede">
            On the day, knowing a fact is not enough. Each explanation shows why the right option
            wins and why every other option loses — the reasoning the exam is testing.
          </p>
          <p className="dp-small">This is the explanation for the DKA question in the sample above.</p>
        </header>

        <figure className="dp-doc" aria-label="An annotated DOHPass explanation">
          <div className="dp-doc__top">
            <span className="tag">{q.system}</span>
            <span className="tag">{q.topic}</span>
          </div>
          <div className="dp-doc__row">
            <p className="dp-doc__note">The answer, and why</p>
            <div className="dp-doc__body">
              <p className="dp-doc__answer"><span className="dp-doc__key">{q.correct}</span>{answer?.text}</p>
              <p>{q.explanation.correct}</p>
            </div>
          </div>
          <div className="dp-doc__row">
            <p className="dp-doc__note">Every distractor, ruled out</p>
            <ul className="dp-doc__body dp-doc__others">
              {Object.entries(q.explanation.distractors).map(([k, v]) => (
                <li key={k}><span className="dp-doc__key dp-doc__key--muted">{k}</span><span>{v}</span></li>
              ))}
            </ul>
          </div>
          <div className="dp-doc__row">
            <p className="dp-doc__note">The rule to keep</p>
            <p className="dp-doc__body dp-doc__rule">{q.explanation.learning}</p>
          </div>
          <div className="dp-doc__row">
            <p className="dp-doc__note">Where it comes from</p>
            <p className="dp-doc__body dp-doc__cite">{q.citation}</p>
          </div>
        </figure>
      </div>
    </section>
  )
}

/* Illustrative only — clearly labelled. Real numbers live on each
   user's dashboard; nothing here is presented as anyone's results. */
const EXAMPLE_TOPICS = [
  { topic: 'Cardiology', pct: 81 },
  { topic: 'Endocrinology', pct: 74 },
  { topic: 'Respiratory', pct: 66 },
  { topic: 'Haematology', pct: 58 },
  { topic: 'Nephrology', pct: 49 },
]

function Progress() {
  return (
    <section className="dp-section dp-section--paper on-paper" aria-labelledby="progress-title">
      <div className="dp-wrap dp-split dp-split--reverse">
        <header className="dp-split__aside">
          <h2 className="dp-h2" id="progress-title">See which topics are costing you marks</h2>
          <p className="dp-lede">
            Every answer is recorded, so your dashboard shows where you are strong and where you
            are not — and what to study next.
          </p>
          <dl className="dp-facts">
            <div><dt>Accuracy by topic</dt><dd>Weak systems surface on their own as you practise.</dd></div>
            <div><dt>Focus drill</dt><dd>A session built from your lowest-scoring topics.</dd></div>
            <div><dt>Spaced review</dt><dd>Flashcards come back just before you are likely to forget them.</dd></div>
            <div><dt>Exam countdown</dt><dd>Set your exam date and a daily question goal to pace yourself.</dd></div>
          </dl>
        </header>

        <figure className="dp-example" aria-labelledby="example-cap">
          <figcaption className="dp-example__cap" id="example-cap">
            <span className="tag tag--brass">Example data</span>
            Accuracy by topic
          </figcaption>
          <ul className="dp-bars">
            {EXAMPLE_TOPICS.map((t, i) => (
              <li key={t.topic} className={i === EXAMPLE_TOPICS.length - 1 ? 'is-weakest' : undefined}>
                <span className="dp-bars__topic">{t.topic}</span>
                <span className="dp-bars__track" aria-hidden="true">
                  <span className="dp-bars__fill" style={{ width: `${t.pct}%` }} />
                </span>
                <span className="dp-bars__pct">{t.pct}%</span>
              </li>
            ))}
          </ul>
          <p className="dp-example__foot">
            Weakest topic: <strong>Nephrology</strong>. It leads your next focus drill.
          </p>
        </figure>
      </div>
    </section>
  )
}

function Authors() {
  return (
    <section className="dp-section dp-section--dark" aria-labelledby="authors-title">
      <div className="dp-wrap dp-split">
        <div className="dp-split__aside">
          <h2 className="dp-h2" id="authors-title">Who is behind DOHPass</h2>
          <div className="dp-person">
            <span className="dp-person__mono" aria-hidden="true">DI</span>
            <div>
              <p className="dp-person__name">Dr. Ibrahim</p>
              <p className="dp-person__role">Internal Medicine Specialist, DOH-licensed</p>
            </div>
          </div>
          <ul className="dp-person__creds">
            <li>Passed the DOH Internal Medicine Specialist exam</li>
            <li>MRCP (UK)</li>
            <li>Oncology and Palliative Care, Tawam Hospital, Al Ain</li>
          </ul>
          <blockquote className="dp-quote">
            <p>
              “Built from the questions I wished I’d had during my own DOH prep. Every other
              resource was USMLE or MRCP adapted. This is purpose-built.”
            </p>
          </blockquote>
        </div>

        <div>
          <h3 className="dp-ledger__title">How the bank is maintained</h3>
          <dl className="dp-ledger">
            <div>
              <dt>Built to the DOH format</dt>
              <dd>Clinical vignettes with one best answer from four or five options.</dd>
            </div>
            <div>
              <dt>Reviewed before publishing</dt>
              <dd>New questions stay unpublished until they pass review.</dd>
            </div>
            <div>
              <dt>Explained option by option</dt>
              <dd>Explanations cover the correct answer and the distractors, with the guideline they rest on where one applies.</dd>
            </div>
            <div>
              <dt>Corrected when reported</dt>
              <dd>
                Email <a href="mailto:hello@dohpass.com">hello@dohpass.com</a> about an error. It is
                checked against the current guideline and fixed in the live bank.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}

function Pricing({ counts }) {
  return (
    <section className="dp-section dp-section--paper on-paper" id="pricing" aria-labelledby="pricing-title">
      <div className="dp-wrap">
        <header className="dp-section__head">
          <h2 className="dp-h2" id="pricing-title">One payment, 30 days of access</h2>
          <p className="dp-lede">
            Choose the bank for the exam you are sitting. Pay by UAE bank transfer; nothing renews
            automatically.
          </p>
        </header>
        <PlanGrid counts={counts} />
        <PlanTerms />
        <div className="dp-paybox">
          <h3 className="dp-paybox__title">How paying by bank transfer works</h3>
          <PaymentSteps headingLevel={4} />
          <p className="dp-paybox__links">
            <Link to="/pricing">Compare plans in detail</Link>
            <Link to="/confirm-payment">Already paid? Confirm your transfer</Link>
          </p>
        </div>
      </div>
    </section>
  )
}

const HOME_FAQ = [FAQ.tryFirst, FAQ.blueprint, FAQ.payment, FAQ.refund, FAQ.whichTrack, FAQ.updates]

function Faq() {
  return (
    <section className="dp-section dp-section--white on-paper" aria-labelledby="faq-title">
      <div className="dp-wrap dp-split">
        <header className="dp-split__aside">
          <h2 className="dp-h2" id="faq-title">Questions before you start</h2>
          <p className="dp-lede">
            Anything else? Email <a href="mailto:hello@dohpass.com">hello@dohpass.com</a>.
          </p>
        </header>
        <Accordion items={HOME_FAQ} />
      </div>
    </section>
  )
}

function Closer({ onStart }) {
  return (
    <section className="dp-closer" aria-labelledby="closer-title">
      <div className="dp-wrap dp-closer__inner">
        <div>
          <h2 className="dp-closer__title" id="closer-title">Start with 10 free questions</h2>
          <p className="dp-closer__sub">Full explanations included. No payment details needed.</p>
        </div>
        <div className="dp-closer__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>Start free</button>
          <Link className="dp-closer__link" to="/pricing">See pricing</Link>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const counts = useQuestionCounts()
  const total = counts ? counts.specialist + counts.gp : null

  useEffect(() => { track('landing_view') }, [])

  // Nav links like /#specialist arrive before the section exists in the DOM.
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [location.hash])

  const startFree = () => navigate('/login?mode=signup')

  return (
    <div className="dp-page">
      <AppNav />
      <main id="main">
        <Hero onStart={startFree} total={total} />
        <Exams counts={counts} />
        <Anatomy />
        <Progress />
        <Authors />
        <Pricing counts={counts} />
        <Faq />
        <Closer onStart={startFree} />
      </main>
      <LandingFooter />
    </div>
  )
}
