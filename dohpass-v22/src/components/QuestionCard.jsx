import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'

export default function QuestionCard({
  question, index, total, correct, wrong,
  selectedOption, submitted, onSelect, onSubmit, onNext, feedback, track,
}) {
  if (!question) return null
  const options = question.options || []

  const correctIdx = resolveCorrectIndex(options, question.answer)
  const dataIssue = submitted && correctIdx === -1

  const accentColor = track === 'gold' ? 'var(--gold)' : 'var(--blue)'
  const btnClass = `btn-primary ${track === 'blue' ? 'blue' : 'gold'}`
  const answered = index + (submitted ? 1 : 0)
  const pct = Math.round((answered / total) * 100)

  function getOptionClass(i) {
    let cls = 'option'
    if (!submitted) {
      if (selectedOption === i) cls += ' selected'
    } else if (dataIssue) {
      cls += ' dimmed'
    } else {
      if (i === correctIdx) cls += ' correct'
      else if (i === selectedOption && i !== correctIdx) cls += ' incorrect'
      else cls += ' dimmed'
    }
    return cls
  }

  return (
    <div className="card-wrap">
      {/* Progress bar */}
      <div className="progress-bar-wrap">
        <div
          className="progress-bar-fill"
          style={{ width: `${((index + 1) / total) * 100}%`, background: accentColor }}
        />
      </div>

      {/* Stats row */}
      <div className="stats-row">
        <span className="stat green">✓ {correct}</span>
        <span className="stat-center">{index + 1} / {total}</span>
        <span className="stat red">✗ {wrong}</span>
      </div>

      {/* Session progress */}
      <div className="session-progress-row" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="session-progress-track">
          <div
            className="session-progress-fill"
            style={{ width: `${pct}%`, background: accentColor }}
          />
        </div>
        <span className="session-progress-label">
          {answered} answered &mdash; {pct}% complete
        </span>
      </div>

      {/* Question */}
      <div className="question-box">
        <div className="question-tags">
          {question.subtopic && (
            <span className={`topic-tag${track === 'blue' ? ' blue' : ''}`}>
              {question.subtopic}
            </span>
          )}
          {question.difficulty && (
            <span className={`difficulty-tag ${question.difficulty}`}>
              {question.difficulty}
            </span>
          )}
        </div>
        <p className="question-text" data-testid="question-text">{question.q}</p>
      </div>

      {/* Options */}
      <div className="options-list">
        {options.map((opt, i) => (
          <button
            key={i}
            className={getOptionClass(i)}
            onClick={() => onSelect(i)}
            disabled={submitted}
            data-testid="option"
            data-option-index={i}
          >
            <span className="option-letter">{String.fromCharCode(65 + i)}</span>
            <span className="option-text">{opt}</span>
          </button>
        ))}
      </div>

      {/* Explanation */}
      {submitted && (
        <div
          className={`explanation ${feedback?.correct ? 'expl-correct' : 'expl-incorrect'}`}
          data-testid="feedback"
          data-feedback-correct={feedback?.correct ? 'true' : 'false'}
        >
          <strong>{feedback?.msg}</strong>
          {question.explanation && !feedback?.dataIssue && <p>{question.explanation}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="card-actions">
        {!submitted ? (
          <button
            className={btnClass}
            onClick={onSubmit}
            disabled={selectedOption === null}
          >
            Submit Answer
          </button>
        ) : (
          <button className={btnClass} onClick={onNext}>
            {index + 1 >= total ? 'View Results' : 'Next Question →'}
          </button>
        )}
      </div>
    </div>
  )
}
