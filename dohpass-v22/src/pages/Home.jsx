import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
      </nav>

      <div className="home-page">
        <div className="hero">
          <h1 className="hero-title">DOH Exam Prep</h1>
          <p className="hero-sub">High-yield questions. Real exam format. UAE-focused.</p>
        </div>

        <div className="tracks">
          <div className="track-card gold-card" onClick={() => navigate('/specialist')}>
            <div className="track-icon">🏅</div>
            <div className="track-info">
              <h2 className="track-title">Internal Medicine Specialist</h2>
              <p className="track-desc">DOH Specialist track — Cardiology, Respiratory, Nephrology & more</p>
              <span className="track-badge gold">681 Questions</span>
            </div>
            <div className="track-arrow">→</div>
          </div>

          <div className="track-card blue-card" onClick={() => navigate('/gp')}>
            <div className="track-icon">🩺</div>
            <div className="track-info">
              <h2 className="track-title">General Practitioner</h2>
              <p className="track-desc">DOH GP track — broad primary care question bank</p>
              <span className="track-badge blue">155 Questions</span>
            </div>
            <div className="track-arrow">→</div>
          </div>
        </div>
      </div>
    </>
  )
}
