export default function ResultsScreen({ correct, wrong, track, onRestart }) {
  const total = correct + wrong
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  const accentColor = track === 'gold' ? 'var(--gold)' : 'var(--blue)'

  function getMessage() {
    if (pct >= 80) return { emoji: '🏆', text: 'Excellent. DOH-ready.' }
    if (pct >= 60) return { emoji: '📈', text: 'Good effort. Keep pushing.' }
    return { emoji: '📚', text: "More revision needed. You've got this." }
  }

  const { emoji, text } = getMessage()

  return (
    <div className="results-wrap">
      <div className="results-card">
        <div className="results-emoji">{emoji}</div>
        <h2 className="results-title">Session Complete</h2>
        <p className="results-subtitle">{text}</p>

        <div className="results-score">
          <span className="score-pct" style={{ color: accentColor }}>{pct}%</span>
        </div>

        <div className="results-breakdown">
          <div className="breakdown-item">
            <span className="breakdown-num green">{correct}</span>
            <span className="breakdown-label">Correct</span>
          </div>
          <div className="breakdown-divider" />
          <div className="breakdown-item">
            <span className="breakdown-num red">{wrong}</span>
            <span className="breakdown-label">Wrong</span>
          </div>
          <div className="breakdown-divider" />
          <div className="breakdown-item">
            <span className="breakdown-num">{total}</span>
            <span className="breakdown-label">Total</span>
          </div>
        </div>

        <button className="btn-primary" style={{ background: accentColor, marginTop: '2rem', width: '100%' }} onClick={onRestart}>
          Restart Session
        </button>
      </div>
    </div>
  )
}
