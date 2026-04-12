import { useNavigate, useParams } from 'react-router-dom'

const SPECIALIST_SYSTEMS = [
  { name: 'Neurology',      icon: '🧠', count: '15 cards',  live: true  },
  { name: 'Cardiology',     icon: '❤️', count: 'Coming soon', live: false },
  { name: 'Haematology',    icon: '🩸', count: 'Coming soon', live: false },
  { name: 'GIT',            icon: '🫁', count: 'Coming soon', live: false },
  { name: 'Endocrinology',  icon: '⚗️', count: 'Coming soon', live: false },
  { name: 'Rheumatology',   icon: '🦴', count: 'Coming soon', live: false },
  { name: 'Nephrology',     icon: '🫘', count: 'Coming soon', live: false },
]

const GP_SYSTEMS = [
  { name: 'Cardiovascular', icon: '❤️', count: 'Coming soon', live: false },
  { name: 'Respiratory',    icon: '🫁', count: 'Coming soon', live: false },
  { name: 'Endocrinology',  icon: '⚗️', count: 'Coming soon', live: false },
  { name: 'Gastroenterology', icon: '🫃', count: 'Coming soon', live: false },
  { name: 'Musculoskeletal', icon: '🦴', count: 'Coming soon', live: false },
  { name: 'Neurology',      icon: '🧠', count: 'Coming soon', live: false },
  { name: 'Infectious Disease', icon: '🦠', count: 'Coming soon', live: false },
]

export default function FlashcardsTrack() {
  const navigate = useNavigate()
  const { track } = useParams()

  const isSpecialist = track === 'specialist'
  const systems = isSpecialist ? SPECIALIST_SYSTEMS : GP_SYSTEMS
  const trackLabel = isSpecialist ? 'Specialist' : 'General Practitioner'
  const accentColor = isSpecialist ? '#F59E0B' : '#4FC3F7'
  const accentBg = isSpecialist ? 'rgba(245,158,11,0.12)' : 'rgba(79,195,247,0.12)'

  function handleSystemClick(system) {
    if (!system.live) return
    navigate('/flashcards/' + track + '/' + system.name.toLowerCase())
  }

  return (
    <>
      <nav>
        <div className="logo">DOH<span>Pass</span></div>
        <button className="nav-cta ghost" onClick={() => navigate('/flashcards')}>← Flashcards</button>
      </nav>

      <div className="home-page">
        <div className="hero">
          <h1 className="hero-title" style={{color: accentColor}}>{trackLabel}</h1>
          <p className="hero-sub">Choose a system to start reviewing</p>
        </div>

        <div className="tracks">
          {systems.map(system => (
            <div
              key={system.name}
              className="track-card"
              onClick={() => handleSystemClick(system)}
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                border: system.live
                  ? '1px solid ' + accentColor + '40'
                  : '1px solid #1E293B',
                cursor: system.live ? 'pointer' : 'default',
                opacity: system.live ? 1 : 0.5,
              }}
            >
              <div className="track-icon">{system.icon}</div>
              <div className="track-info">
                <h2 className="track-title" style={{color: system.live ? accentColor : '#475569'}}>
                  {system.name}
                </h2>
                <p className="track-desc">
                  {system.live ? 'Tap to start reviewing' : 'Being prepared — check back soon'}
                </p>
                <span
                  className="track-badge"
                  style={{
                    background: system.live ? accentBg : 'rgba(71,85,105,0.2)',
                    color: system.live ? accentColor : '#475569',
                    border: '1px solid ' + (system.live ? accentColor + '30' : '#1E293B'),
                  }}
                >
                  {system.count}
                </span>
              </div>
              {system.live && (
                <div className="track-arrow" style={{color: accentColor}}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
