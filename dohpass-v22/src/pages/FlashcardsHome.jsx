import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function FlashcardsHome() {
  const navigate = useNavigate()

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
        <button className="nav-cta ghost" onClick={() => navigate('/')}>← Home</button>
      </nav>

      <div className="home-page">
        <div className="hero">
          <h1 className="hero-title">Flashcards</h1>
          <p className="hero-sub">High-yield concept, drug & anatomy cards — by track and system</p>
        </div>

        <div className="tracks">
          <div
            className="track-card gold-card"
            onClick={() => navigate('/flashcards/specialist')}
          >
            <div className="track-icon">🏅</div>
            <div className="track-info">
              <h2 className="track-title">Specialist</h2>
              <p className="track-desc">Internal Medicine — Neurology, Cardiology, GIT, Haematology & more</p>
              <span className="track-badge gold">7 Systems</span>
            </div>
            <div className="track-arrow">→</div>
          </div>

          <div
            className="track-card blue-card"
            onClick={() => navigate('/flashcards/gp')}
          >
            <div className="track-icon">🩺</div>
            <div className="track-info">
              <h2 className="track-title">General Practitioner</h2>
              <p className="track-desc">GP track — broad primary care systems</p>
              <span className="track-badge blue">Coming Soon</span>
            </div>
            <div className="track-arrow">→</div>
          </div>
        </div>
      </div>
    </>
  )
}
