export default function QuestionCard({
  question, index, total, correct, wrong,
  selectedOption, submitted, onSelect, onSubmit, onNext, feedback, track,
}) {
  if (!question) return null
  const options = question.options || []
  const correctIdx = question.answer
    ? question.options.findIndex(opt =>
        opt.trim().toUpperCase().startsWith(question.answer.trim().toUpperCase() + '.')
      )
    : -1
  const accentColor = track === 'gold' ? 'var(--gold)' : 'var(--blue)'
  function getOptionClass(i) {
    let cls = 'option'
    if (!submitted) {
      if (selectedOption === i) cls += ' selected'
    } else {
      if (i === correctIdx) cls += ' correct'
      else if (i === selectedOption && i !== correctIdx) cls += ' incorrect'
      else cls += ' dimmed'
    }
    return cls
  }
  return (
    <div className="card-wrap">
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${((index + 1) / total) * 100}%`, background: accentColor }} />
      </div>
      <div className="stats-row">
        <span className="stat green">✓ {correct}</span>
        <span className="stat-center">{index + 1} / {total}</span>
        <span className="stat red">✗ {wrong}</span>
      </div>
      {question.subtopic && (
        <div className="topic-tag" style={{ borderColor: accentColor, color: accentColor }}>
          {question.subtopic}
        </div>
      )}
      <div className="question-box">
        <p className="question-text">{question.q}</p>
      </div>
      <div className="options-list">
        {options.map((opt, i) => (
          <button key={i} className={getOptionClass(i)} onClick={() => onSelect(i)} disabled={submitted}>
            <span className="option-text">{opt}</span>
          </button>
        ))}
      </div>
      {submitted && (
        <div className={`explanation ${feedback?.correct ? 'expl-correct' : 'expl-incorrect'}`}>
          <strong>{feedback?.msg}</strong>
          {question.explanation && <p>{question.explanation}</p>}
        </div>
      )}
      <div className="card-actions">
        {!submitted ? (
          <button className="btn-primary" style={selectedOption !== null ? { background: accentColor } : {}} onClick={onSubmit} disabled={selectedOption === null}>
            Submit
          </button>
        ) : (
          <button className="btn-primary" style={{ background: accentColor }} onClick={onNext}>
            {index + 1 >= total ? 'See Results' : 'Next →'}
          </button>
        )}
      </div>
    </div>
  )
}
