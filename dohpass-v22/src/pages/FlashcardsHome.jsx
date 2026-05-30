import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const BADGE_STYLE = {
  background: '#d4a843',
  color: '#1a1209',
  border: 'none',
  fontSize: '0.76rem',
  padding: '0.25rem 0.75rem',
}

export default function FlashcardsHome() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ specialistSystems: 0, gpCards: 0 })

  useEffect(() => {
    async function loadStats() {
      const { data, error } = await supabase
        .from('flashcards')
        .select('track, system')
        .eq('is_active', true)
      if (error || !data) return
      const specialistSystems = new Set(
        data.filter(r => r.track?.toLowerCase() === 'specialist').map(r => r.system)
      ).size
      const gpCards = data.filter(r => r.track?.toLowerCase() === 'gp').length
      setStats({ specialistSystems, gpCards })
    }
    loadStats()
  }, [])

  return (
    <div className="home-page" style={{ paddingTop: '62px' }}>
      <div className="hero" style={{ marginBottom: '2.45rem' }}>
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
            <span className="track-badge" style={BADGE_STYLE}>{stats.specialistSystems} Systems</span>
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
            <span className="track-badge" style={BADGE_STYLE}>{stats.gpCards.toLocaleString()} Cards</span>
          </div>
          <div className="track-arrow">→</div>
        </div>
      </div>
    </div>
  )
}
