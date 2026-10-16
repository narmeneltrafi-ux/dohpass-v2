/* Who builds DOHPass and how the bank is kept accurate. Shared by the
   landing page and /about so the two can't drift. Every line is a fact
   the founder can stand behind: credentials, and a review process that
   matches how questions are actually published (drafts stay unpublished
   until they pass review; reported errors are fixed in the live bank). */
export default function TrustPanel() {
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
