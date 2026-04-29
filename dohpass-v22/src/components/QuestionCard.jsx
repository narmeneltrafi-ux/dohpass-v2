import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveCorrectIndex } from '../lib/resolveCorrectIndex'
import ShinyBorderButton from './ShinyBorderButton'

/* ───────────────────────────────────────────────────────────────
   Premium question-taking interface.

   Owns the entire chrome of an active quiz session:
   sticky progress bar + topbar at the top of the viewport,
   metadata strip, question stem, glass answer options, the
   submit/next CTA (sticky-to-bottom on mobile), and the
   post-submission explanation panel.

   Test selectors preserved for e2e/scoring.spec.js:
   - data-testid="question-text" on the stem
   - data-testid="option" + data-option-index on each option
   - data-testid="feedback" + data-feedback-correct on the panel
   - "Submit Answer" accessible button name (pre-submission)
   ─────────────────────────────────────────────────────────────── */

const IconArrowLeft = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
)
const IconArrowRight = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const IconCheck = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconX = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

function letterFor(i) { return String.fromCharCode(65 + i) }

export default function QuestionCard({
  question, index, total,
  selectedOption, submitted, onSelect, onSubmit, onNext, feedback, track,
  mode = 'tutor',
  chromeTop = null,
  chromeBookmark = null,
}) {
  const navigate = useNavigate()
  const explRef = useRef(null)
  const stemRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

  const options = question?.options || []
  const correctIdx = question ? resolveCorrectIndex(options, question.answer) : -1
  const dataIssue = submitted && correctIdx === -1
  const accentClass = track === 'blue' ? 'qui-blue' : 'qui-gold'
  const modeLabel = mode === 'timed' ? 'TIMED' : 'TUTOR MODE'
  const pct = total > 0 ? ((index + (submitted ? 1 : 0)) / total) * 100 : 0

  /* haptic + delayed select so taps feel weighty */
  const handleSelectInternal = useCallback((i) => {
    if (submitted) return
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(10) } catch { /* unsupported */ }
    }
    setTimeout(() => onSelect(i), 50)
  }, [submitted, onSelect])

  /* simulate ~200ms loading on submit so it feels deliberate and prevents
     accidental double-submission */
  const handleSubmitInternal = useCallback(() => {
    if (selectedOption === null || submitted || submitting) return
    setSubmitting(true)
    setTimeout(() => {
      onSubmit()
      setSubmitting(false)
    }, 200)
  }, [selectedOption, submitted, submitting, onSubmit])

  /* keyboard shortcuts: 1-N to select, Enter to submit, Right arrow / Enter
     to advance after submission, Escape to dashboard */
  useEffect(() => {
    function handleKey(e) {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return

      if (e.key === 'Escape') {
        navigate('/dashboard')
        return
      }
      if (!submitted) {
        const idx = parseInt(e.key, 10)
        if (Number.isInteger(idx) && idx >= 1 && idx <= options.length) {
          e.preventDefault()
          handleSelectInternal(idx - 1)
          return
        }
        if (e.key === 'Enter' && selectedOption !== null) {
          e.preventDefault()
          handleSubmitInternal()
        }
      } else {
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
          e.preventDefault()
          onNext()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [submitted, selectedOption, options.length, onNext, navigate, handleSelectInternal, handleSubmitInternal])

  /* fade explanation panel into view */
  useEffect(() => {
    if (submitted && explRef.current) {
      const t = setTimeout(() => {
        explRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
      return () => clearTimeout(t)
    }
  }, [submitted])

  /* scroll to top of new question after Next */
  useEffect(() => {
    if (!submitted && stemRef.current) {
      stemRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!question) return null

  function getOptionState(i) {
    if (!submitted) return selectedOption === i ? 'selected' : 'idle'
    if (dataIssue) return 'idle'
    if (i === correctIdx) return 'correct'
    if (i === selectedOption && i !== correctIdx) return 'incorrect'
    return 'idle'
  }

  return (
    <div className={`qui-page ${accentClass}`}>
      <div className="qui-stickyhead">
        <div
          className="qui-progress"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Session progress"
        >
          <div className="qui-progress__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="qui-topbar">
          <button
            className="qui-back"
            onClick={() => navigate('/dashboard')}
            aria-label="Back to dashboard"
            type="button"
          >
            <IconArrowLeft />
          </button>
          <div className="qui-counter" aria-live="polite">
            Question {index + 1} of {total}
          </div>
          <div className="qui-modepill">{modeLabel}</div>
        </div>
      </div>

      <div className="qui-body">
        {chromeTop ? <div className="qui-chrome">{chromeTop}</div> : null}

        <div className="qui-meta">
          <div className="qui-meta__tags">
            {(question.topic || question.subtopic) && (
              <span className="qui-meta__tag">
                {String(question.topic || question.subtopic).toUpperCase()}
              </span>
            )}
            {question.difficulty && (
              <>
                <span className="qui-meta__sep" aria-hidden="true">·</span>
                <span className="qui-meta__tag">{String(question.difficulty).toUpperCase()}</span>
              </>
            )}
            {question.source && (
              <>
                <span className="qui-meta__sep" aria-hidden="true">·</span>
                <span className="qui-meta__tag">{String(question.source).toUpperCase()}</span>
              </>
            )}
          </div>
          {chromeBookmark ? <div className="qui-meta__bookmark">{chromeBookmark}</div> : null}
        </div>

        <p ref={stemRef} className="qui-stem" data-testid="question-text">
          {question.q}
        </p>

        <div className="qui-options" role="radiogroup" aria-label="Answer options">
          {options.map((opt, i) => {
            const state = getOptionState(i)
            return (
              <button
                key={i}
                type="button"
                className={`qui-opt qui-opt--${state}`}
                onClick={() => handleSelectInternal(i)}
                disabled={submitted}
                role="radio"
                aria-checked={selectedOption === i}
                data-testid="option"
                data-option-index={i}
              >
                <span className="qui-opt__letter" aria-hidden="true">{letterFor(i)}</span>
                <span className="qui-opt__text">{opt}</span>
                {submitted && state === 'correct' && (
                  <span className="qui-opt__icon qui-opt__icon--ok" aria-label="Correct answer">
                    <IconCheck />
                  </span>
                )}
                {submitted && state === 'incorrect' && (
                  <span className="qui-opt__icon qui-opt__icon--bad" aria-label="Your selected answer was incorrect">
                    <IconX />
                  </span>
                )}
                {submitted && state === 'correct' && i !== selectedOption && (
                  <span className="qui-opt__flag">CORRECT</span>
                )}
              </button>
            )
          })}
        </div>

        {!submitted && (
          <div className="qui-actions">
            {selectedOption === null ? (
              <button className="qui-cta qui-cta--ghost" disabled aria-disabled="true" type="button">
                Select an answer
              </button>
            ) : (
              <ShinyBorderButton
                onClick={handleSubmitInternal}
                disabled={submitting}
                aria-label="Submit Answer"
              >
                {submitting ? 'Submitting…' : 'Submit Answer'} <IconArrowRight />
              </ShinyBorderButton>
            )}
          </div>
        )}

        {submitted && (
          <div
            ref={explRef}
            className={`qui-expl${
              dataIssue ? ' qui-expl--issue' : feedback?.correct ? ' qui-expl--ok' : ' qui-expl--bad'
            }`}
            data-testid="feedback"
            data-feedback-correct={feedback?.correct ? 'true' : 'false'}
          >
            <div className="qui-expl__head">
              <span className={`qui-expl__pill${feedback?.correct ? ' qui-expl__pill--ok' : ' qui-expl__pill--bad'}`}>
                {dataIssue
                  ? 'Data issue'
                  : feedback?.correct
                    ? `Correct — ${question.answer}`
                    : `Correct answer: ${question.answer}`}
              </span>
              {!dataIssue && question.source && (
                <span className="qui-expl__source">{question.source}</span>
              )}
            </div>

            {dataIssue ? (
              <p className="qui-expl__body">{feedback?.msg}</p>
            ) : (
              question.explanation && (
                <p className="qui-expl__body">{question.explanation}</p>
              )
            )}

            <div className="qui-actions qui-actions--inline">
              <ShinyBorderButton onClick={onNext}>
                {index + 1 >= total ? 'Finish Session' : 'Next Question'} <IconArrowRight />
              </ShinyBorderButton>
            </div>
          </div>
        )}

        <div className="qui-hint" aria-hidden="true">
          1–{Math.min(options.length, 5)} to select · Enter to submit · → for next
        </div>
      </div>
    </div>
  )
}
