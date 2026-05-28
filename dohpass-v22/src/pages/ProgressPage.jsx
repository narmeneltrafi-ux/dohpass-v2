import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchFullProgress, fetchAllQuestionsMinimal, primaryTopic } from '../lib/supabase'
import { useBookmarks } from '../hooks/useBookmarks'

function accuracyColor(pct) {
  if (pct >= 70) return 'var(--green)'
  if (pct >= 50) return 'var(--gold)'
  return 'var(--red)'
}

export default function ProgressPage() {
  const navigate = useNavigate()
  const [activeTrack, setActiveTrack] = useState('specialist')
  const [activeTab, setActiveTab] = useState('analytics')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    specialist: { progress: [], questionsMap: new Map() },
    gp: { progress: [], questionsMap: new Map() },
  })
  const [bookmarked, setBookmarked] = useState([])
  const [bmLoading, setBmLoading] = useState(false)

  const { getBookmarkedQuestions } = useBookmarks(activeTrack)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchFullProgress('specialist'),
      fetchFullProgress('gp'),
      fetchAllQuestionsMinimal('specialist'),
      fetchAllQuestionsMinimal('gp'),
    ]).then(([specProgress, gpProgress, specQuestions, gpQuestions]) => {
      const buildMap = (qs) => {
        const m = new Map()
        qs.forEach(q => m.set(q.id, primaryTopic(q.topic)))
        return m
      }
      setData({
        specialist: { progress: specProgress, questionsMap: buildMap(specQuestions) },
        gp: { progress: gpProgress, questionsMap: buildMap(gpQuestions) },
      })
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (activeTab !== 'bookmarks') return
    setBmLoading(true)
    getBookmarkedQuestions().then(qs => {
      setBookmarked(qs)
      setBmLoading(false)
    })
  }, [activeTab, activeTrack])

  const { progress, questionsMap: qMap } = data[activeTrack]

  const stats = useMemo(() => {
    const total = progress.length
    const correct = progress.filter(r => r.is_correct).length
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
    return { total, correct, accuracy }
  }, [progress])

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

  const accentVar = activeTrack === 'specialist' ? 'gold' : 'blue'

  return (
    <div className="an" style={{ paddingTop: '62px' }}>
      <div className="hw-orb hw-orb--1" />
      <div className="hw-orb hw-orb--2" />
      <div className="hw-orb hw-orb--3" />

      <div className="an-page">
        <h1 className="an-title">Your Progress</h1>

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

        {/* Content tabs */}
        <div className="an-tabs" style={{ marginTop: '0', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0' }}>
          <button
            className={`an-tab an-tab--${accentVar}${activeTab === 'analytics' ? ' active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
          <button
            className={`an-tab an-tab--${accentVar}${activeTab === 'bookmarks' ? ' active' : ''}`}
            onClick={() => setActiveTab('bookmarks')}
          >
            Bookmarks
          </button>
        </div>

        {/* Analytics tab */}
        {activeTab === 'analytics' && (
          loading ? (
            <div className="loading"><div className={`spinner${accentVar === 'blue' ? ' blue' : ''}`} /></div>
          ) : progress.length === 0 ? (
            <div className="an-empty">
              <p>No questions answered yet for this track.</p>
              <button
                className={`btn-primary ${accentVar}`}
                onClick={() => navigate(activeTrack === 'specialist' ? '/specialist' : '/gp')}
              >
                Start Practising
              </button>
            </div>
          ) : (
            <>
              <div className="an-stats">
                <div className="an-stat-card">
                  <span className={`an-stat-big ${accentVar}`}>{stats.accuracy}%</span>
                  <span className="an-stat-label">Overall Accuracy</span>
                </div>
                <div className="an-stat-card">
                  <span className="an-stat-big">{stats.total}</span>
                  <span className="an-stat-label">Questions Answered</span>
                </div>
                <div className="an-stat-card">
                  <span className="an-stat-big">{topicStats.length}</span>
                  <span className="an-stat-label">Topics Covered</span>
                </div>
              </div>

              <div className="an-card">
                <h3 className="an-card-title">Topics — Weakest First</h3>
                <div className="an-topic-list">
                  {topicStats.map(t => (
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
            </>
          )
        )}

        {/* Bookmarks tab */}
        {activeTab === 'bookmarks' && (
          bmLoading ? (
            <div className="loading"><div className={`spinner${accentVar === 'blue' ? ' blue' : ''}`} /></div>
          ) : bookmarked.length === 0 ? (
            <div className="an-empty">
              <p>No bookmarks yet on this track.</p>
              <p style={{ fontSize: '13px', opacity: 0.6 }}>Star questions while practising to save them here.</p>
            </div>
          ) : (
            <div className="an-card">
              <h3 className="an-card-title">Saved Questions ({bookmarked.length})</h3>
              {bookmarked.map((q, i) => (
                <div key={q.id} className="an-topic-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '16px 0' }}>
                  <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                    <span className={`an-topic-pct`} style={{ color: 'var(--gold)', flexShrink: 0 }}>Q{i + 1}</span>
                    <span className="an-topic-name" style={{ flex: 1, fontSize: '13px', opacity: 0.6 }}>{q.topic}</span>
                  </div>
                  <p className="an-topic-name" style={{ margin: 0, lineHeight: 1.6 }}>{q.q}</p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
