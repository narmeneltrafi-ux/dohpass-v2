import { useNavigate } from 'react-router-dom'

function getVerdict(pct) {
  if (pct >= 80) return {
    label: 'Strong performance',
    sub: 'Your accuracy is above the DOH pass benchmark. Keep this up.',
    mod: 'pass',
  }
  if (pct >= 65) return {
    label: 'Approaching pass mark',
    sub: "You're close to benchmark. Target your weak topics and review the explanations.",
    mod: 'near',
  }
  if (pct >= 50) return {
    label: 'More revision needed',
    sub: 'Focus on the topics you missed. Review each explanation before moving on.',
    mod: 'work',
  }
  return {
    label: 'Foundational review needed',
    sub: 'Work through the explanations systematically. Understanding the reasoning closes the gap faster than volume.',
    mod: 'low',
  }
}

export default function ResultsScreen({ correct, wrong, track, onRestart }) {
  const navigate = useNavigate()
  const total = correct + wrong
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  const verdict = getVerdict(pct)

  const scoreClass = `score-pct ${track === 'gold' ? 'gold' : 'blue'}`
  const btnClass = `btn-primary ${track === 'gold' ? 'gold' : 'blue'} results-restart`
  const trackPath = track === 'gold' ? 'specialist' : 'gp'
  const drillFirst = pct < 65

  return (
    <div className="results-wrap">
      <div className="results-card">
        <p className={`results-verdict results-verdict--${verdict.mod}`}>{verdict.label}</p>
        <h2 className="results-title">Session complete</h2>
        <p className="results-subtitle">{verdict.sub}</p>

        <div className="results-score">
          <span className={scoreClass}>{pct}%</span>
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

        {drillFirst ? (
          <>
            <button className={btnClass} onClick={() => navigate(`/${trackPath}?drill=1`)}>
              Drill weak topics
            </button>
            <button className="results-nav-btn" onClick={onRestart}>
              Practice again
            </button>
          </>
        ) : (
          <button className={btnClass} onClick={onRestart}>
            Practice again
          </button>
        )}
        <button className="results-nav-btn" onClick={() => navigate('/progress')}>
          View progress
        </button>
        <button className="results-nav-btn results-nav-btn--ghost" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
