import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Home() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
        <button className="nav-cta ghost" onClick={handleLogout}>Log Out</button>
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
              <span className="track-badge gold">756 Questions</span>
            </div>
            <div className="track-arrow">→</div>
          </div>

          <div className="track-card blue-card" onClick={() => navigate('/gp')}>
            <div className="track-icon">🩺</div>
            <div className="track-info">
              <h2 className="track-title">General Practitioner</h2>
              <p className="track-desc">DOH GP track — broad primary care question bank</p>
              <span className="track-badge blue">988 Questions</span>
            </div>
            <div className="track-arrow">→</div>
          </div>

          <div className="track-card" style={{background:'linear-gradient(135deg,#0F172A 0%,#1A2744 100%)',border:'1px solid rgba(79,195,247,0.25)',cursor:'pointer'}} onClick={() => navigate('/flashcards/neurology')}>
            <div className="track-icon">🗂</div>
            <div className="track-info">
              <h2 className="track-title" style={{color:'#4FC3F7'}}>Flashcards</h2>
              <p className="track-desc">High-yield concept, drug & anatomy cards — by system</p>
              <span className="track-badge" style={{background:'rgba(79,195,247,0.15)',color:'#4FC3F7',border:'1px solid rgba(79,195,247,0.3)'}}>Neurology Live</span>
            </div>
            <div className="track-arrow" style={{color:'#4FC3F7'}}>→</div>
          </div>
        </div>
      </div>
    </>
  )
}
