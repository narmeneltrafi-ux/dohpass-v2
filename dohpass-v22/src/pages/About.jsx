import AppNav from '../components/AppNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'

const STORY = [
  {
    eyebrow: 'The problem',
    title: 'DOH prep, scattered across PDFs and out-of-date resources.',
    body: (
      <>
        <p>The DOH licensing exam decides whether you can practise in Abu Dhabi &mdash; but
          the prep market hasn&rsquo;t kept up with it. Most candidates end up stitching their
          revision together from question banks built for the wrong exam, photocopies passed
          between batches, and threads on social media that nobody fact-checks.</p>
        <p>The blueprint changes. The questions don&rsquo;t. People pay a lot of money for
          material that is sometimes years out of date.</p>
      </>
    ),
  },
  {
    eyebrow: 'Why DOHPass exists',
    title: 'Built out of the prep our founder wished he\u2019d had.',
    body: (
      <p>DOHPass started as a private spreadsheet during one physician&rsquo;s own DOH prep:
        clinical vignettes written in Pearson-VUE format, mapped row-by-row to the official
        DOH blueprint, and graded by accuracy of the explanation rather than by how many
        questions you could fit on a page. It worked. Other residents asked for access. The
        spreadsheet became a product.</p>
    ),
  },
  {
    eyebrow: 'The approach',
    title: 'Written and reviewed by UAE physicians, mapped to the current blueprint.',
    body: (
      <>
        <p>Every question is authored by a UAE-based physician, mapped to the current DOH
          blueprint, and put through a review pass against the relevant guideline before it
          ships. New vignettes are added weekly; existing ones are revised whenever a
          guideline changes or a reviewer flags an update.</p>
        <p>We don&rsquo;t recycle questions from international banks. We don&rsquo;t pad the
          count with low-yield trivia.</p>
      </>
    ),
  },
  {
    eyebrow: 'The founder',
    title: 'Dr. Ibrahim',
    body: (
      <>
        <p>Oncology &amp; Palliative Care SHO at Tawam Hospital in Al Ain. Sat the DOH himself,
          got tired of the prep options on offer, and decided that if nobody was going to
          build the bank he wanted, he&rsquo;d write it himself.</p>
        <p className="lp-about__founderQuote">
          &ldquo;Built from the questions I wished I&rsquo;d had during my own DOH prep.&rdquo;
        </p>
      </>
    ),
  },
  {
    eyebrow: 'What we\u2019re building next',
    title: 'Cardiology &amp; Respiratory specialty banks.',
    body: (
      <p>Cardiology &amp; Respiratory specialty banks &mdash; adding this month.</p>
    ),
  },
]

export default function About() {
  return (
    <div className="lp-root lp-about">
      <div className="hw-orb hw-orb--1 lp-orb-dim" />
      <div className="hw-orb hw-orb--2 lp-orb-dim" />
      <div className="hw-orb hw-orb--3 lp-orb-dim" />

      <AppNav />

      <header className="lp-doc__hero lp-about__hero">
        <h1 className="lp-doc__h1">Built by physicians, for physicians.</h1>
      </header>

      <main className="lp-about__body">
        {STORY.map((s, i) => {
          const isFounder = s.eyebrow === 'The founder'
          return (
            <section key={s.eyebrow} className={`lp-about__section${isFounder ? ' lp-about__section--founder' : ''}`}>
              <span className="lp-about__eyebrow">{s.eyebrow}</span>
              {isFounder ? (
                <div className="lp-about__founder">
                  <div className="lp-about__avatar" aria-label="Founder portrait placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" width="14" height="14" aria-hidden="true">
                      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
                      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
                      <circle cx="20" cy="10" r="2"/>
                    </svg>
                  </div>
                  <div className="lp-about__founderText">
                    <h2 className="lp-about__h2">{s.title}</h2>
                    <div className="lp-about__founderTitle">
                      Oncology &amp; Palliative Care SHO &middot; Tawam Hospital, Al Ain
                    </div>
                    {s.body}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="lp-about__h2">{s.title}</h2>
                  {s.body}
                </>
              )}
            </section>
          )
        })}
      </main>

      <LandingFooter />
    </div>
  )
}
