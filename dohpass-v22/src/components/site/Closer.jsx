import { Link } from 'react-router-dom'

/* Closing call to action on charcoal: one brass button, one quiet link. */
export default function Closer({ onStart }) {
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
