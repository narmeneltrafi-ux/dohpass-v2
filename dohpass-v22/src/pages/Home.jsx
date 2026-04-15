import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, fetchProgress } from '../lib/supabase'

function TrackProgress({ track, accentColor, total }) {
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    fetchProgress(track).then(p => {
      if (p && p.answered > 0) setProgress(p)
    })
  }, [track])

  if (!progress || progress.answered === 0) return null
  const pct = Math.round((progress.answered / total) * 100)

  return (
    <div className="home-progress-wrap">
      <div className="home-progress-bar">
        <div
          className="home-progress-fill"
          style={{ width: `${pct}%`, background: accentColor }}
        />
      </div>
      <div className="home-progress-label">
        <span style={{ color: accentColor }}>{progress.answered} answered</span>
        <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
      </div>
    </div>
  )
}

export default function Home() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
        <button className="nav-cta ghost" onClick={handleLogout}>Log Out</button>
      </nav>
      <div className="home-page">
        <div className="hero">
          <div className="hero-eyebrow">UAE Medical Licensing</div>
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
              <TrackProgress track="specialist" accentColor="var(--gold)" total={756} />
            </div>
            <div className="track-arrow">→</div>
          </div>
          <div className="track-card blue-card" onClick={() => navigate('/gp')}>
            <div className="track-icon">🩺</div>
            <div className="track-info">
              <h2 className="track-title">General Practitioner</h2>
              <p className="track-desc">DOH GP track — broad primary care question bank</p>
              <span className="track-badge blue">988 Questions</span>
              <TrackProgress track="gp" accentColor="var(--blue)" total={988} />
            </div>
            <div className="track-arrow">→</div>
          </div>
          <div className="track-card teal-card" onClick={() => navigate('/flashcards')}>
            <div className="track-icon">🗂</div>
            <div className="track-info">
              <h2 className="track-title teal">Flashcards</h2>
              <p className="track-desc">Concept, drug & anatomy cards — Specialist & GP tracks</p>
              <span className="track-badge teal">Neurology Live</span>
            </div>
            <div className="track-arrow">→</div>
          </div>
        </div>
      </div>
    </>
  )
}
