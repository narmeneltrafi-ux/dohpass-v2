import { useEffect, useState } from 'react'
import { useProgress } from '../hooks/useProgress'
import { useBookmarks } from '../hooks/useBookmarks'

const GOLD = '#D4AF37'
const GOLD_DIM = 'rgba(212,175,55,0.15)'
const CARD = 'rgba(255,255,255,0.04)'
const BORDER = 'rgba(255,255,255,0.08)'

function StatCard({ label, value, sub, color = GOLD }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`,
      borderRadius: '16px', padding: '24px', flex: 1, minWidth: '140px',
    }}>
      <p style={{ color: '#666', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>{label}</p>
      <p style={{ color, fontSize: '36px', fontFamily: "'Playfair Display', serif", fontWeight: 700, margin: '0 0 4px' }}>{value}</p>
      {sub && <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>{sub}</p>}
    </div>
  )
}

function TopicBar({ topic, correct, total, pct }) {
  const color = pct < 50 ? '#ef4444' : pct < 75 ? GOLD : '#22c55e'
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ color: '#ccc', fontSize: '14px' }}>{topic}</span>
        <span style={{ color, fontSize: '13px', fontWeight: 600 }}>{pct}% <span style={{ color: '#555', fontWeight: 400 }}>({correct}/{total})</span></span>
      </div>
      <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '6px', borderRadius: '99px', width: `${pct}%`,
          background: color, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}

export default function ProgressPage() {
  const [track, setTrack] = useState('specialist')
  const { getStats, loading } = useProgress()
  const { getBookmarkedQuestions } = useBookmarks(track)
  const [stats, setStats] = useState(null)
  const [bookmarked, setBookmarked] = useState([])
  const [tab, setTab] = useState('analytics')

  useEffect(() => {
    getStats(track).then(setStats)
    getBookmarkedQuestions().then(setBookmarked)
  }, [track])

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    fontSize: '14px', fontWeight: 600, transition: 'all 0.2s',
    background: tab === t ? GOLD_DIM : 'transparent',
    color: tab === t ? GOLD : '#666',
    borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', padding: '40px 24px', color: '#fff' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '32px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
            Your Progress
          </h1>
          <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>Track performance and review saved questions</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
          {['specialist', 'gp'].map(t => (
            <button key={t} onClick={() => setTrack(t)} style={{
              padding: '8px 20px', borderRadius: '99px', border: `1px solid ${track === t ? GOLD : BORDER}`,
              background: track === t ? GOLD_DIM : 'transparent',
              color: track === t ? GOLD : '#666', cursor: 'pointer', fontSize: '13px',
              fontWeight: 600, textTransform: 'capitalize', transition: 'all 0.2s',
            }}>
              {t === 'specialist' ? 'Specialist' : 'GP'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${BORDER}`, marginBottom: '32px' }}>
          <button style={tabStyle('analytics')} onClick={() => setTab('analytics')}>Analytics</button>
          <button style={tabStyle('bookmarks')} onClick={() => setTab('bookmarks')}>
            Bookmarks {bookmarked.length > 0 && <span style={{ color: GOLD, marginLeft: '4px' }}>({bookmarked.length})</span>}
          </button>
        </div>

        {tab === 'analytics' && (
          <>
            {loading && <p style={{ color: '#555' }}>Loading...</p>}
            {!loading && !stats?.totalAttempted && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
                <p style={{ fontSize: '40px', marginBottom: '12px' }}>📊</p>
                <p style={{ fontSize: '16px' }}>No attempts yet on this track.</p>
                <p style={{ fontSize: '13px' }}>Answer some questions to see your analytics here.</p>
              </div>
            )}
            {!loading && stats?.totalAttempted > 0 && (
              <>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '40px' }}>
                  <StatCard label="Overall Score" value={`${stats.overallPct}%`} sub={`${stats.totalCorrect} of ${stats.totalAttempted} correct`} />
                  <StatCard label="Attempted" value={stats.totalAttempted} sub="questions" color="#fff" />
                  <StatCard label="Topics" value={stats.topics.length} sub="covered" color="#fff" />
                </div>
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '28px' }}>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', margin: '0 0 24px', color: '#fff' }}>
                    Topics — Weakest First
                  </h2>
                  {stats.topics.map(s => <TopicBar key={s.topic} {...s} />)}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'bookmarks' && (
          <>
            {bookmarked.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
                <p style={{ fontSize: '40px', marginBottom: '12px' }}>★</p>
                <p style={{ fontSize: '16px' }}>No bookmarks yet.</p>
                <p style={{ fontSize: '13px' }}>Star questions while practising to save them here.</p>
              </div>
            )}
            {bookmarked.map((q, i) => (
              <div key={q.id} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px',
                padding: '20px', marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ color: GOLD, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{q.topic}</span>
                  <span style={{ color: '#444', fontSize: '12px' }}>Q{i + 1}</span>
                </div>
                <p style={{ color: '#ddd', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{q.q}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
