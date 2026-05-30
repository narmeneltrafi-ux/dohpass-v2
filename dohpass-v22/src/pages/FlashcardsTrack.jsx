import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, getProfile, hasAccess } from '../lib/supabase'

const IconLock = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const IconArrowRight = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

function systemMonogram(name) {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function FlashcardsTrack() {
  const navigate = useNavigate()
  const { track } = useParams()

  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [profile, setProfile] = useState(undefined)

  const trackKey    = (track || '').toLowerCase() === 'specialist' ? 'specialist' : 'gp'
  const isSpecialist = trackKey === 'specialist'
  const trackLabel  = isSpecialist ? 'Specialist' : 'General Practitioner'
  const accentColor = isSpecialist ? 'var(--gold)' : 'var(--blue-light)'
  const accentBg    = isSpecialist ? 'var(--gold-dim)' : 'var(--blue-dim)'
  const accentBorder = isSpecialist ? 'var(--gold-border)' : 'var(--blue-border)'

  const hasFullAccess = Boolean(
    hasAccess(profile) && (profile?.plan === 'all_access' || profile?.plan === trackKey)
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
        .map(r => ({ name: r.system, total: r.total, previewTotal: r.preview_total ?? 0 }))
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
        <h1 className="hero-title" style={{ color: accentColor }}>{trackLabel}</h1>
        <p className="hero-sub">Choose a system to start reviewing</p>
      </div>

      <div className="tracks">
        {loading && (
          <div className="loading"><div className="spinner" />Loading systems…</div>
        )}
        {error && <div className="loading error">{error}</div>}
        {!loading && !error && systems.length === 0 && (
          <div className="loading">No flashcard systems available yet — check back soon.</div>
        )}

        {!loading && !error && systems.map(system => (
          <div
            key={system.name}
            className="track-card"
            onClick={() => navigate('/flashcards/' + track + '/' + system.name.toLowerCase())}
          >
            <div className="track-icon" style={{ color: accentColor, background: accentBg, borderColor: accentBorder, fontSize: '0.88rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {systemMonogram(system.name)}
            </div>
            <div className="track-info">
              <h2 className="track-title" style={{ color: accentColor }}>
                {system.name}
              </h2>
              <p className="track-desc">Tap to start reviewing</p>
              <span
                className="track-badge"
                style={{ background: accentBg, color: accentColor, borderColor: accentBorder }}
              >
                {!hasFullAccess && <IconLock size={11} />}
                {badgeText(system)}
              </span>
            </div>
            <div className="track-arrow" style={{ color: accentColor }}>
              <IconArrowRight />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
