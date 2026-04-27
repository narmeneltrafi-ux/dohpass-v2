import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, getProfile } from '../lib/supabase'

const SYSTEM_ICONS = {
  'Neurology':        '🧠',
  'Cardiology':       '❤️',
  'Haematology':      '🩸',
  'GIT':              '🫃',
  'Endocrinology':    '⚗️',
  'Rheumatology':     '🦴',
  'Nephrology':       '🫘',
  'Respiratory':      '🫁',
  'Infectious Disease': '🦠',
  'Pharmacology':     '💊',
  'Dermatology':      '🩹',
  'Psychiatry':       '🧬',
  'Oncology':         '🔬',
  'Musculoskeletal':  '💪',
  'Cardiovascular':   '🫀',
  'Gastroenterology': '🫃',
  'Obstetrics':       '🤰',
  'Paediatrics':      '👶',
  'Ophthalmology':    '👁️',
  'ENT':              '👂',
  'Primary Care':     '🩺',
}

function getIcon(system) {
  return SYSTEM_ICONS[system] || '📋'
}

export default function FlashcardsTrack() {
  const navigate = useNavigate()
  const { track } = useParams()

  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(undefined)

  const trackKey = (track || '').toLowerCase() === 'specialist' ? 'specialist' : 'gp'
  const isSpecialist = trackKey === 'specialist'
  const trackLabel = isSpecialist ? 'Specialist' : 'General Practitioner'
  const accentColor = isSpecialist ? '#F59E0B' : '#4FC3F7'
  const accentBg = isSpecialist ? 'rgba(245,158,11,0.12)' : 'rgba(79,195,247,0.12)'

  const hasFullAccess = Boolean(
    profile?.is_paid && (profile.plan === 'all_access' || profile.plan === trackKey)
  )
  const isAnon = profile === null

  useEffect(() => {
    async function fetchSystems() {
      setLoading(true)
      setError(null)
      const { data: counts, error } = await supabase.rpc('flashcard_counts')
      if (error) {
        console.error('flashcard_counts RPC failed:', error)
        setError('Could not load systems.')
        setLoading(false)
        return
      }
      const result = (counts || [])
        .filter(r => r.track?.toLowerCase() === trackKey)
        .map(r => ({
          name: r.system,
          total: r.total,
          previewTotal: r.preview_total ?? 0,
        }))
        .sort((a, b) => b.total - a.total)
      setSystems(result)
      setLoading(false)
    }
    fetchSystems()
  }, [trackKey])

  useEffect(() => {
    let cancelled = false
    getProfile().then(p => { if (!cancelled) setProfile(p ?? null) })
    return () => { cancelled = true }
  }, [])

  function badgeText(system) {
    if (hasFullAccess) return `${system.total} cards`
    if (isAnon) {
      const locked = Math.max(system.total - system.previewTotal, 0)
      return `${system.previewTotal} free preview · sign in to unlock ${locked}`
    }
    return `${system.previewTotal} free · ${system.total} total`
  }

  return (
      <div className="home-page" style={{ paddingTop: '62px' }}>
        <div className="hero">
          <h1 className="hero-title" style={{color: accentColor}}>{trackLabel}</h1>
          <p className="hero-sub">Choose a system to start reviewing</p>
        </div>

        <div className="tracks">

          {loading && (
            <div className="loading">
              <div className="spinner" />
              Loading systems...
            </div>
          )}

          {error && (
            <div className="loading error">{error}</div>
          )}

          {!loading && !error && systems.length === 0 && (
            <div className="loading">No flashcard systems available yet — check back soon.</div>
          )}

          {!loading && !error && systems.map(system => (
            <div
              key={system.name}
              className="track-card"
              onClick={() => navigate('/flashcards/' + track + '/' + system.name.toLowerCase())}
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                border: '1px solid ' + accentColor + '40',
                cursor: 'pointer',
              }}
            >
              <div className="track-icon">{getIcon(system.name)}</div>
              <div className="track-info">
                <h2 className="track-title" style={{color: accentColor}}>
                  {system.name}
                </h2>
                <p className="track-desc">Tap to start reviewing</p>
                <span
                  className="track-badge"
                  style={{
                    background: accentBg,
                    color: accentColor,
                    border: '1px solid ' + accentColor + '30',
                    opacity: hasFullAccess ? 1 : 0.85,
                  }}
                >
                  {!hasFullAccess && <span style={{ marginRight: 4 }}>🔒</span>}
                  {badgeText(system)}
                </span>
              </div>
              <div className="track-arrow" style={{color: accentColor}}>→</div>
            </div>
          ))}

        </div>
      </div>
  )
}
