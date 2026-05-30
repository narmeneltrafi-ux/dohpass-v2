import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase, getProfile, hasAccess } from '../lib/supabase'

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

const SYSTEM_BORDER_COLORS = {
  'GIT':           '#14b8a6',
  'Cardiology':    '#f87171',
  'Haematology':   '#a78bfa',
  'Endocrinology': '#fbbf24',
}

function getIcon(system) {
  return SYSTEM_ICONS[system] || '📋'
}

function getBorderColor(systemName) {
  return SYSTEM_BORDER_COLORS[systemName] || '#d4a843'
}

export default function FlashcardsTrack() {
  const navigate = useNavigate()
  const { track } = useParams()

  const [systems, setSystems]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [profile, setProfile]       = useState(undefined)
  const [userId, setUserId]         = useState(null)
  const [progressMap, setProgressMap] = useState({})

  const trackKey    = (track || '').toLowerCase() === 'specialist' ? 'specialist' : 'gp'
  const isSpecialist = trackKey === 'specialist'
  const trackLabel  = isSpecialist ? 'Specialist' : 'General Practitioner'
  const accentColor = isSpecialist ? '#F59E0B' : '#4FC3F7'

  const hasFullAccess = Boolean(
    hasAccess(profile) && (profile?.plan === 'all_access' || profile?.plan === trackKey)
  )
  const isAnon = profile === null

  // Fetch flashcard counts per system
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

  // Fetch auth profile
  useEffect(() => {
    let cancelled = false
    getProfile().then(p => { if (!cancelled) setProfile(p ?? null) })
    return () => { cancelled = true }
  }, [])

  // Fetch user ID for progress query
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  // Fetch per-system reviewed card count from flashcard_progress
  useEffect(() => {
    if (!userId || systems.length === 0) return
    async function fetchProgress() {
      const { data: flashcards } = await supabase
        .from('flashcards')
        .select('id, system')
        .ilike('track', trackKey)
        .eq('is_active', true)
      if (!flashcards?.length) return

      const allIds = flashcards.map(f => f.id)
      const { data: fp } = await supabase
        .from('flashcard_progress')
        .select('flashcard_id')
        .eq('user_id', userId)
        .in('flashcard_id', allIds)
      if (!fp) return

      const fcSystemMap = new Map(flashcards.map(f => [f.id, f.system]))
      const pm = {}
      for (const row of fp) {
        const sys = fcSystemMap.get(row.flashcard_id)
        if (sys) pm[sys] = (pm[sys] || 0) + 1
      }
      setProgressMap(pm)
    }
    fetchProgress()
  }, [userId, systems, trackKey])

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
      <div className="hero" style={{ marginBottom: '2.45rem' }}>
        <h1 className="hero-title" style={{ color: accentColor }}>{trackLabel}</h1>
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

        {!loading && !error && systems.map(system => {
          const borderColor  = getBorderColor(system.name)
          const reviewed     = progressMap[system.name] ?? 0
          const hasProgress  = reviewed > 0

          return (
            <div
              key={system.name}
              className="track-card"
              onClick={() => navigate('/flashcards/' + track + '/' + system.name.toLowerCase())}
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                border: '1px solid ' + accentColor + '40',
                borderLeft: '3px solid ' + borderColor,
                cursor: 'pointer',
                justifyContent: 'space-between',
              }}
            >
              <div className="track-icon">{getIcon(system.name)}</div>
              <div className="track-info">
                <h2 className="track-title" style={{ color: accentColor, fontWeight: 700 }}>
                  {system.name}
                </h2>
                <p style={{
                  fontSize: '0.72rem',
                  fontWeight: 500,
                  margin: '0.15rem 0 0.35rem',
                  color: hasProgress ? '#d4a843' : '#718096',
                }}>
                  {hasProgress
                    ? `${reviewed} / ${system.total} reviewed`
                    : `0 / ${system.total} — Not started`}
                </p>
                <p className="track-desc" style={{ color: '#a0aec0' }}>Tap to start reviewing</p>
                <span
                  className="track-badge"
                  style={{
                    background: '#d4a843',
                    color: '#1a1209',
                    border: 'none',
                    fontSize: '0.76rem',
                    padding: '0.25rem 0.75rem',
                    opacity: hasFullAccess ? 1 : 0.85,
                  }}
                >
                  {!hasFullAccess && <span style={{ marginRight: 4 }}>🔒</span>}
                  {badgeText(system)}
                </span>
              </div>
              <div className="track-arrow" style={{ color: accentColor }}>→</div>
            </div>
          )
        })}

      </div>
    </div>
  )
}
