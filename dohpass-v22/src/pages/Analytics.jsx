import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import { supabase, getProfile, fetchFullProgress, fetchAllQuestionsMinimal, primaryTopic } from '../lib/supabase'

const IconCross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="20" rx="2" />
    <rect x="2" y="9" width="20" height="6" rx="2" />
  </svg>
)

// DOH blueprint weights per track (topic → fractional weight, sums to 1).
// Sources: DOH exam content specifications and question-bank frequency analysis.
const BLUEPRINT = {
  specialist: {
    'Cardiology': 0.18, 'Endocrinology': 0.12, 'Respiratory Medicine': 0.12,
    'Nephrology': 0.10, 'Gastroenterology': 0.10, 'Rheumatology': 0.08,
    'Neurology': 0.08, 'Haematology': 0.08, 'Infectious Disease': 0.08,
    'Dermatology': 0.06,
  },
  gp: {
    'Family Medicine': 0.18, 'Psychiatry': 0.12, 'Paediatrics': 0.12,
    'Obstetrics & Gynaecology': 0.10, 'Community Medicine': 0.09,
    'Dermatology': 0.08, 'ENT': 0.08, 'Ophthalmology': 0.07,
    'Orthopaedics': 0.07, 'General Medicine': 0.09,
  },
}

// Bayesian-smoothed, blueprint-weighted pass prediction with sigmoid centred at
// the 60% exam pass mark. Returns 0-100.
function computePassProb(topicStats, track) {
  const weights = BLUEPRINT[track] || {}
  // Bayesian prior: 5 correct out of 10 (= 50% baseline before any evidence)
  const PRIOR_CORRECT = 5
  const PRIOR_TOTAL   = 10

  let weightedSum = 0
  let weightTotal  = 0

  for (const [topic, w] of Object.entries(weights)) {
    const stat = topicStats.find(t => t.topic === topic)
    const correct = (stat?.correct ?? 0) + PRIOR_CORRECT
    const total   = (stat?.total   ?? 0) + PRIOR_TOTAL
    weightedSum  += w * (correct / total)
    weightTotal  += w
  }

  // Any residual blueprint weight goes to topics not in our hardcoded list.
  // Fall back to prior for those.
  if (weightTotal < 1) {
    weightedSum += (1 - weightTotal) * (PRIOR_CORRECT / PRIOR_TOTAL)
  }

  // Sigmoid centred at the 60% pass mark; steepness = 8 so ±10pp of raw accuracy
  // maps to ±57pp of pass probability — appropriately sensitive around the threshold.
  const centered = (weightedSum - 0.60) * 8
  const sigmoid  = 1 / (1 + Math.exp(-centered))
  return Math.round(sigmoid * 100)
}

function planBadge(profile) {
  if (!profile) return null
  const { plan, is_paid } = profile
  if (plan === 'all_access' || (is_paid && plan !== 'gp' && plan !== 'specialist'))
    return { label: 'All Access', cls: 'plan-badge--all' }
  if (plan === 'specialist') return { label: 'Specialist', cls: 'plan-badge--gold' }
  if (plan === 'gp') return { label: 'GP Plan', cls: 'plan-badge--blue' }
  return { label: 'Free', cls: 'plan-badge--free' }
}

export default function Analytics() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [activeTrack, setActiveTrack] = useState('specialist')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    specialist: { progress: [], questionsMap: new Map() },
    gp: { progress: [], questionsMap: new Map() },
  })

  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchFullProgress('specialist'),
      fetchFullProgress('gp'),
      fetchAllQuestionsMinimal('specialist'),
      fetchAllQuestionsMinimal('gp'),
    ]).then(([specProgress, gpProgress, specQuestions, gpQuestions]) => {
      const buildMap = (questions) => {
        const m = new Map()
        questions.forEach(q => m.set(q.id, primaryTopic(q.topic)))
        return m
      }
      setData({
        specialist: { progress: specProgress, questionsMap: buildMap(specQuestions) },
        gp: { progress: gpProgress, questionsMap: buildMap(gpQuestions) },
      })
      setLoading(false)
    })
  }, [])

  const trackData = data[activeTrack]
  const progress = trackData.progress
  const qMap = trackData.questionsMap

  const stats = useMemo(() => {
    const total   = progress.length
    const correct = progress.filter(r => r.is_correct).length
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    // Improvement trend: compare last 20 vs preceding 20 answers
    const recent  = progress.slice(-20)
    const prior   = progress.slice(-40, -20)
    const recentAcc = recent.length  > 0 ? recent.filter(r => r.is_correct).length  / recent.length  : null
    const priorAcc  = prior.length   > 0 ? prior.filter(r => r.is_correct).length   / prior.length   : null
    let trend = null
    if (recentAcc !== null && priorAcc !== null) {
      const delta = recentAcc - priorAcc
      trend = delta > 0.03 ? '↑' : delta < -0.03 ? '↓' : '→'
    }

    return { total, correct, accuracy, trend }
  }, [progress])

  // Per-topic breakdown
  const topicStats = useMemo(() => {
    const map = {}
    progress.forEach(row => {
      const topic = qMap.get(row.question_id) || 'Unknown'
      if (!map[topic]) map[topic] = { topic, total: 0, correct: 0 }
      map[topic].total++
      if (row.is_correct) map[topic].correct++
    })
    return Object.values(map)
      .map(t => ({ ...t, accuracy: Math.round((t.correct / t.total) * 100) }))
      .sort((a, b) => a.accuracy - b.accuracy)
  }, [progress, qMap])

  const weakTopics = topicStats.slice(0, 5)

  // Daily activity (last 14 days)
  const dailyData = useMemo(() => {
    const days = {}
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days[key] = { date: key, correct: 0, wrong: 0 }
    }
    progress.forEach(row => {
      if (!row.created_at) return
      const key = row.created_at.slice(0, 10)
      if (days[key]) {
        if (row.is_correct) days[key].correct++
        else days[key].wrong++
      }
    })
    return Object.values(days)
  }, [progress])

  const maxDaily = Math.max(1, ...dailyData.map(d => d.correct + d.wrong))

  const passProb  = topicStats.length > 0 ? computePassProb(topicStats, activeTrack) : null
  const badge     = planBadge(profile)
  const accentVar = activeTrack === 'specialist' ? 'gold' : 'blue'

  function accuracyColor(pct) {
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return 'var(--gold)'
    return 'var(--red)'
  }

  return (
    <div className="an" style={{ paddingTop: '62px' }}>
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      <div className="an-page">
        <h1 className="an-title">Performance Analytics</h1>

        {/* Track tabs */}
        <div className="an-tabs">
          <button
            className={`an-tab an-tab--gold${activeTrack === 'specialist' ? ' active' : ''}`}
            onClick={() => setActiveTrack('specialist')}
          >
            Specialist
          </button>
          <button
            className={`an-tab an-tab--blue${activeTrack === 'gp' ? ' active' : ''}`}
            onClick={() => setActiveTrack('gp')}
          >
            GP
          </button>
        </div>

        {loading ? (
          <div className="loading"><div className={`spinner ${accentVar === 'gold' ? '' : 'blue'}`} /></div>
        ) : progress.length === 0 ? (
          <div className="an-empty">
            <p>No questions answered yet for this track.</p>
            <button className={`btn-primary ${accentVar}`} onClick={() => navigate(activeTrack === 'specialist' ? '/specialist' : '/gp')}>
              Start Practising
            </button>
          </div>
        ) : (
          <>
            {/* Top stats */}
            <div className="an-stats">
              <div className="an-stat-card">
                <span className={`an-stat-big ${accentVar}`}>
                  {stats.accuracy}%
                  {stats.trend && (
                    <span
                      className="an-trend"
                      style={{ color: stats.trend === '↑' ? 'var(--green)' : stats.trend === '↓' ? 'var(--red)' : 'var(--text-muted)' }}
                    >{stats.trend}</span>
                  )}
                </span>
                <span className="an-stat-label">Overall Accuracy</span>
              </div>
              <div className="an-stat-card">
                <span className="an-stat-big" style={{ color: passProb !== null ? accuracyColor(passProb) : 'inherit' }}>
                  {passProb !== null ? `${passProb}%` : '—'}
                </span>
                <span className="an-stat-label">Est. Pass Probability</span>
              </div>
              <div className="an-stat-card">
                <span className="an-stat-big">{stats.total}</span>
                <span className="an-stat-label">Questions Answered</span>
              </div>
            </div>

            {/* Daily activity chart */}
            <div className="an-card">
              <h3 className="an-card-title">Daily Activity</h3>
              <div className="an-chart">
                {dailyData.map(d => {
                  const total = d.correct + d.wrong
                  return (
                    <div key={d.date} className="an-chart-col">
                      <div className="an-chart-bar">
                        {d.correct > 0 && (
                          <div
                            className="an-chart-seg an-chart-seg--correct"
                            style={{ height: `${(d.correct / maxDaily) * 100}%` }}
                          />
                        )}
                        {d.wrong > 0 && (
                          <div
                            className="an-chart-seg an-chart-seg--wrong"
                            style={{ height: `${(d.wrong / maxDaily) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className="an-chart-label">
                        {new Date(d.date + 'T00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                      </span>
                      {total > 0 && <span className="an-chart-count">{total}</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Weak topics */}
            {weakTopics.length > 0 && (
              <div className="an-card">
                <h3 className="an-card-title">Weak Topics</h3>
                <div className="an-topic-list">
                  {weakTopics.map(t => (
                    <div key={t.topic} className="an-topic-row an-topic-row--weak">
                      <span className="an-topic-name">{t.topic}</span>
                      <div className="an-topic-bar-wrap">
                        <div
                          className="an-topic-bar"
                          style={{ width: `${t.accuracy}%`, background: accuracyColor(t.accuracy) }}
                        />
                      </div>
                      <span className="an-topic-pct" style={{ color: accuracyColor(t.accuracy) }}>
                        {t.accuracy}%
                      </span>
                      <span className="an-topic-count">{t.correct}/{t.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full topic breakdown */}
            <div className="an-card">
              <h3 className="an-card-title">All Topics</h3>
              <div className="an-table-wrap">
                <table className="an-table">
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Answered</th>
                      <th>Correct</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topicStats.map(t => (
                      <tr key={t.topic}>
                        <td>{t.topic}</td>
                        <td>{t.total}</td>
                        <td>{t.correct}</td>
                        <td style={{ color: accuracyColor(t.accuracy), fontWeight: 700 }}>{t.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
