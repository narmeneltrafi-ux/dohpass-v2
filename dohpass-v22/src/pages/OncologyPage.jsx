// src/pages/OncologyPage.jsx
// Acute Oncology Fundamentals — Free Access (no login required)
// Fetches from Supabase: oncology_questions table (public anon read)

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AMBER = '#F59E0B'
const PANEL_BG = 'rgba(17,24,39,0.5)'
const PANEL_BORDER = '1px solid rgba(245,158,11,0.2)'

const DIFFICULTY_COLORS = {
  easy:   { bg: 'rgba(16,185,129,0.12)', fg: '#34D399', border: 'rgba(16,185,129,0.4)' },
  medium: { bg: 'rgba(245,158,11,0.12)', fg: '#FBBF24', border: 'rgba(245,158,11,0.4)' },
  hard:   { bg: 'rgba(239,68,68,0.12)',  fg: '#FCA5A5', border: 'rgba(239,68,68,0.4)'  },
}

function letterFor(i) {
  return String.fromCharCode(65 + i) // 0 -> A
}

function OncologyQuestionCard({ question }) {
  const [revealed, setRevealed] = useState(false)
  const options = Array.isArray(question.options) ? question.options : []
  const correctLetter = typeof question.answer === 'string' ? question.answer.trim().toUpperCase() : ''
  const correctIdx = correctLetter.charCodeAt(0) - 65
  const diffKey = (question.difficulty || '').toLowerCase()
  const diffStyle = DIFFICULTY_COLORS[diffKey] || DIFFICULTY_COLORS.medium

  return (
    <div style={{ background: PANEL_BG, border: PANEL_BORDER, borderRadius: '10px', padding: '24px' }}>
      {/* Meta row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <span style={{
          background: diffStyle.bg, color: diffStyle.fg,
          border: `1px solid ${diffStyle.border}`, borderRadius: '4px',
          padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
        }}>
          {question.difficulty || 'medium'}
        </span>
        {question.broad_topic && (
          <span style={{
            background: 'rgba(245,158,11,0.08)', color: '#FCD34D',
            border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px',
            padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600,
          }}>
            {question.broad_topic}
          </span>
        )}
        {question.subtopic && (
          <span style={{ color: '#9CA3AF', fontSize: '0.75rem', padding: '2px 6px' }}>
            {question.subtopic}
          </span>
        )}
      </div>

      {/* Question */}
      <p style={{
        color: '#F9FAFB', fontSize: '1rem', lineHeight: 1.6,
        marginBottom: '20px', whiteSpace: 'pre-wrap',
      }}>
        {question.q}
      </p>

      {/* Options */}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
        {options.map((opt, i) => {
          const isCorrect = revealed && i === correctIdx
          return (
            <li key={i} style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              background: isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(31,41,55,0.6)',
              border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.5)' : 'rgba(75,85,99,0.5)'}`,
              borderRadius: '6px', padding: '10px 14px',
              color: isCorrect ? '#6EE7B7' : '#E5E7EB',
            }}>
              <span style={{ fontWeight: 700, color: isCorrect ? '#34D399' : '#9CA3AF', minWidth: '20px' }}>
                {letterFor(i)}.
              </span>
              <span style={{ flex: 1 }}>{opt}</span>
            </li>
          )
        })}
      </ol>

      {/* Reveal */}
      <div style={{ marginTop: '16px' }}>
        <button
          type="button"
          onClick={() => setRevealed(r => !r)}
          style={{
            background: revealed ? 'rgba(245,158,11,0.15)' : 'transparent',
            border: `1px solid ${AMBER}`, color: AMBER,
            borderRadius: '6px', padding: '8px 16px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          {revealed ? 'Hide Answer' : 'Show Answer'}
        </button>
      </div>

      {revealed && (
        <div style={{
          marginTop: '16px', padding: '16px',
          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: '6px',
        }}>
          <p style={{ color: '#34D399', fontWeight: 600, marginBottom: '8px' }}>
            Correct answer: {correctLetter}
            {correctIdx >= 0 && correctIdx < options.length ? ` — ${options[correctIdx]}` : ''}
          </p>
          {question.explanation && (
            <p style={{ color: '#D1D5DB', lineHeight: 1.6, marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
              {question.explanation}
            </p>
          )}
          {question.source && (
            <span style={{
              display: 'inline-block',
              background: 'rgba(245,158,11,0.1)', color: AMBER,
              border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: '4px', padding: '2px 10px',
              fontSize: '0.75rem', fontWeight: 600,
            }}>
              {question.source}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function OncologyPage() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    difficulty: 'all',
    broad_topic: 'all',
    source: 'all',
  })
  const [stats, setStats] = useState({
    total: 0,
    byDifficulty: { easy: 0, medium: 0, hard: 0 },
    byBroadTopic: {},
  })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        let query = supabase
          .from('oncology_questions')
          .select('*')
          .eq('is_active', true)
          .order('id', { ascending: true })

        if (filters.difficulty !== 'all') query = query.eq('difficulty', filters.difficulty)
        if (filters.broad_topic !== 'all') query = query.eq('broad_topic', filters.broad_topic)
        if (filters.source !== 'all') query = query.eq('source', filters.source)

        const { data, error: fetchError } = await query
        if (fetchError) throw fetchError
        if (cancelled) return

        const rows = data || []
        setQuestions(rows)

        const byDiff = { easy: 0, medium: 0, hard: 0 }
        const byBroadTopic = {}
        rows.forEach((q) => {
          const d = (q.difficulty || '').toLowerCase()
          if (byDiff[d] !== undefined) byDiff[d]++
          if (q.broad_topic) byBroadTopic[q.broad_topic] = (byBroadTopic[q.broad_topic] || 0) + 1
        })
        setStats({ total: rows.length, byDifficulty: byDiff, byBroadTopic })
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching oncology questions:', err)
          setError(err.message || 'Failed to load questions.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [filters])

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#F9FAFB', padding: '24px' }}>
      {/* Header */}
      <div style={{ maxWidth: '1280px', margin: '0 auto 48px' }}>
        <div style={{ borderLeft: `4px solid ${AMBER}`, paddingLeft: '24px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '3rem', fontFamily: 'serif', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            Acute Oncology Fundamentals
          </h1>
          <p style={{ fontSize: '1.125rem', color: '#D1D5DB' }}>
            Oncologic emergencies, staging, diagnosis, performance status, acute complications, and paraneoplastic syndromes.
          </p>
          <div style={{ marginTop: '16px', display: 'inline-block', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '8px 16px' }}>
            <span style={{ color: AMBER, fontWeight: 600 }}>Free Access</span>
            <span style={{ color: '#9CA3AF', margin: '0 8px' }}>|</span>
            <span style={{ color: '#9CA3AF' }}>{stats.total} Questions</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'Easy', value: stats.byDifficulty.easy },
            { label: 'Medium', value: stats.byDifficulty.medium },
            { label: 'Hard', value: stats.byDifficulty.hard },
            { label: 'Categories', value: Object.keys(stats.byBroadTopic).length },
          ].map((s) => (
            <div key={s.label} style={{ background: PANEL_BG, border: PANEL_BORDER, borderRadius: '8px', padding: '16px' }}>
              <p style={{ color: AMBER, fontSize: '0.875rem', fontWeight: 600 }}>{s.label}</p>
              <p style={{ color: '#fff', fontSize: '1.875rem', fontFamily: 'serif', fontWeight: 700, marginTop: '8px' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ maxWidth: '1280px', margin: '0 auto 32px' }}>
        <div style={{ background: PANEL_BG, border: PANEL_BORDER, borderRadius: '8px', padding: '24px' }}>
          <p style={{ color: AMBER, fontWeight: 600, marginBottom: '16px' }}>Filter Questions</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              { label: 'Difficulty', pluralLabel: 'Difficulties', key: 'difficulty', options: ['all', 'easy', 'medium', 'hard'] },
              { label: 'Category', pluralLabel: 'Categories', key: 'broad_topic', options: ['all', 'Emergencies', 'Staging', 'Diagnosis', 'Management'] },
              { label: 'Guideline', pluralLabel: 'Guidelines', key: 'source', options: ['all', 'ASCO 2023', 'NCCN 2024', 'ESMO 2024', 'UICC TNM 8th edition', 'FIGO 2014', 'ATA 2015'] },
            ].map((f) => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '0.875rem', color: '#D1D5DB', marginBottom: '8px' }}>{f.label}</label>
                <select
                  value={filters[f.key]}
                  onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}
                  style={{ width: '100%', background: '#1F2937', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '8px 12px', color: '#F9FAFB' }}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o === 'all' ? `All ${f.pluralLabel}` : o}</option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', color: '#D1D5DB', marginBottom: '8px' }}>&nbsp;</label>
              <button
                onClick={() => setFilters({ difficulty: 'all', broad_topic: 'all', source: 'all' })}
                style={{ width: '100%', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '6px', padding: '8px 12px', color: AMBER, fontWeight: 600, cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {error && (
          <div style={{ background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '16px', color: '#FCA5A5', marginBottom: '32px' }}>
            Error: {error}
          </div>
        )}
        {loading && <p style={{ textAlign: 'center', color: '#9CA3AF', padding: '48px' }}>Loading questions...</p>}
        {!loading && questions.length === 0 && !error && (
          <p style={{ textAlign: 'center', color: '#9CA3AF', padding: '48px' }}>No questions match your filters.</p>
        )}
        {!loading && questions.length > 0 && (
          <div style={{ display: 'grid', gap: '24px' }}>
            {questions.map((q) => (
              <OncologyQuestionCard key={q.id} question={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
