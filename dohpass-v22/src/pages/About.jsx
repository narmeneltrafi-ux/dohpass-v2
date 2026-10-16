import { useNavigate } from 'react-router-dom'
import AppNav from '../components/AppNav.jsx'
import LandingFooter from '../components/LandingFooter.jsx'
import TrustPanel from '../components/site/TrustPanel.jsx'
import Closer from '../components/site/Closer.jsx'

/* About — the founder's account of why DOHPass exists, then the same
   credentials and review process the landing page shows (TrustPanel), so
   the two pages can't make different claims. */
export default function About() {
  const navigate = useNavigate()
  return (
    <div className="dp-page">
      <AppNav />
      <main id="main">
        <section className="dp-pagehead" aria-labelledby="about-h1">
          <div className="dp-wrap">
            <h1 className="dp-pagehead__title" id="about-h1">Built by a physician who sat the DOH exam</h1>
            <p className="dp-pagehead__sub">
              Why DOHPass exists, who builds it, and how the question bank is kept accurate.
            </p>
          </div>
        </section>

        <section className="dp-section dp-section--white on-paper" aria-label="Why DOHPass exists">
          <div className="dp-wrap">
            <div className="dp-prose">
              <h2>DOH prep is scattered across PDFs and out-of-date resources</h2>
              <p>
                The DOH licensing exam decides whether you can practise in Abu Dhabi, but the prep
                market hasn’t kept up with it. Most candidates end up stitching their revision
                together from question banks built for the wrong exam, photocopies passed between
                batches, and threads on social media that nobody fact-checks.
              </p>
              <p>
                The blueprint changes. The questions don’t. People pay a lot of money for material
                that is sometimes years out of date.
              </p>

              <h2>Built out of the prep our founder wished he’d had</h2>
              <p>
                DOHPass started as a private spreadsheet during one physician’s own DOH prep:
                clinical vignettes written in Pearson VUE format, mapped row by row to the DOH
                blueprint, and judged by the accuracy of the explanation rather than by how many
                questions fit on a page. It worked. Other residents asked for access. The
                spreadsheet became a product.
              </p>
            </div>
          </div>
        </section>

        <TrustPanel />
        <Closer onStart={() => navigate('/login?mode=signup')} />
      </main>
      <LandingFooter />
    </div>
  )
}
