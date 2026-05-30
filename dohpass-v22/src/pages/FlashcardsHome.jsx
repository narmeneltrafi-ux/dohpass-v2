import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const IconSpecialist = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3v6a4 4 0 0 0 8 0V3" /><path d="M5 3H3M13 3h2" />
    <path d="M9 13v2a5 5 0 0 0 5 5 5 5 0 0 0 5-5v-1" /><circle cx="19" cy="11" r="2" />
  </svg>
)
const IconGP = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 12h3.5l2-4 4 8 2-4h5.5" />
    <path d="M21 12.5a5 5 0 0 0-9-3 5 5 0 0 0-9 3 5 5 0 0 0 1.5 3.5L12 21l7.5-5a5 5 0 0 0 1.5-3.5z" opacity=".25" />
  </svg>
)
const IconArrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

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
      <div className="hero">
        <h1 className="hero-title">Flashcards</h1>
        <p className="hero-sub">High-yield concept, drug & anatomy cards — by track and system</p>
      </div>
      <div className="tracks">
        <div
          className="track-card gold-card"
          onClick={() => navigate('/flashcards/specialist')}
        >
          <div className="track-icon"><IconSpecialist /></div>
          <div className="track-info">
            <h2 className="track-title">Specialist</h2>
            <p className="track-desc">Internal Medicine — Neurology, Cardiology, GIT, Haematology & more</p>
            <span className="track-badge gold">{stats.specialistSystems} Systems</span>
          </div>
          <div className="track-arrow"><IconArrow /></div>
        </div>
        <div
          className="track-card blue-card"
          onClick={() => navigate('/flashcards/gp')}
        >
          <div className="track-icon"><IconGP /></div>
          <div className="track-info">
            <h2 className="track-title">General Practitioner</h2>
            <p className="track-desc">GP track — broad primary care systems</p>
            <span className="track-badge blue">{stats.gpCards.toLocaleString()} Cards</span>
          </div>
          <div className="track-arrow"><IconArrow /></div>
        </div>
      </div>
    </div>
  )
}
