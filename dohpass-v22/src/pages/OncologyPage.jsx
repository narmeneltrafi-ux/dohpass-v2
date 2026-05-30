// src/pages/OncologyPage.jsx
// Acute Oncology Fundamentals — Free Access (no login required)

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function letterFor(i) { return String.fromCharCode(65 + i) }

function OncologyQuestionCard({ question }) {
  const [revealed, setRevealed] = useState(false)
  const options = Array.isArray(question.options) ? question.options : []
  const correctLetter = typeof question.answer === 'string' ? question.answer.trim().toUpperCase() : ''
  const correctIdx = correctLetter.charCodeAt(0) - 65
  const diffKey = (question.difficulty || 'medium').toLowerCase()

  return (
    <div className="onc-card">
      <div className="onc-card__meta">
        <span className={`onc-pill onc-pill--${diffKey}`}>
          {question.difficulty || 'medium'}
        </span>
        {question.broad_topic && (
          <span className="onc-pill onc-pill--topic">{question.broad_topic}</span>
        )}
        {question.subtopic && (
          <span className="onc-card__subtopic">{question.subtopic}</span>
        )}
      </div>

      <p className="onc-card__stem">{question.q}</p>

      <ol className="onc-options">
        {options.map((opt, i) => {
          const isCorrect = revealed && i === correctIdx
          return (
            <li key={i} className={`onc-opt${isCorrect ? ' onc-opt--correct' : ''}`}>
              <span className="onc-opt__letter">{letterFor(i)}.</span>
              <span>{opt}</span>
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        className={`onc-reveal-btn${revealed ? ' onc-reveal-btn--active' : ''}`}
        onClick={() => setRevealed(r => !r)}
      >
        {revealed ? 'Hide answer' : 'Show answer'}
      </button>

      {revealed && (
        <div className="onc-expl">
          <p className="onc-expl__answer">
            Correct answer: {correctLetter}
            {correctIdx >= 0 && correctIdx < options.length ? ` — ${options[correctIdx]}` : ''}
          </p>
          {question.explanation && (
            <p className="onc-expl__body">{question.explanation}</p>
          )}
          {question.source && (
            <span className="onc-expl__source">{question.source}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function OncologyPage() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [filters, setFilters]     = useState({ difficulty: 'all', broad_topic: 'all', source: 'all' })
  const [stats, setStats]         = useState({ total: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 }, byBroadTopic: {} })

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

        if (filters.difficulty  !== 'all') query = query.eq('difficulty',  filters.difficulty)
        if (filters.broad_topic !== 'all') query = query.eq('broad_topic', filters.broad_topic)
        if (filters.source      !== 'all') query = query.eq('source',      filters.source)

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
    <div className="onc-page">
      <div className="onc-inner">

        <header className="onc-header">
          <div className="onc-accent-bar">
            <h1 className="onc-h1">Acute Oncology Fundamentals</h1>
            <p className="onc-sub">
              Oncologic emergencies, staging, diagnosis, performance status, acute complications, and paraneoplastic syndromes.
            </p>
            <div className="onc-access-badge">
              <span className="onc-access-badge__label">Free Access</span>
              <span className="onc-access-badge__sep" aria-hidden="true">·</span>
              <span className="onc-access-badge__count">{stats.total} questions</span>
            </div>
          </div>

          <div className="onc-stats">
            {[
              { label: 'Easy',       value: stats.byDifficulty.easy },
              { label: 'Medium',     value: stats.byDifficulty.medium },
              { label: 'Hard',       value: stats.byDifficulty.hard },
              { label: 'Categories', value: Object.keys(stats.byBroadTopic).length },
            ].map((s) => (
              <div key={s.label} className="onc-stat-card">
                <p className="onc-stat-card__label">{s.label}</p>
                <p className="onc-stat-card__num">{s.value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="onc-filters">
          <p className="onc-filters__label">Filter questions</p>
          <div className="onc-filter-grid">
            {[
              { label: 'Difficulty', pluralLabel: 'Difficulties', key: 'difficulty',  options: ['all', 'easy', 'medium', 'hard'] },
              { label: 'Category',   pluralLabel: 'Categories',   key: 'broad_topic', options: ['all', 'Emergencies', 'Staging', 'Diagnosis', 'Management'] },
              { label: 'Guideline',  pluralLabel: 'Guidelines',   key: 'source',      options: ['all', 'ASCO 2023', 'NCCN 2024', 'ESMO 2024', 'UICC TNM 8th edition', 'FIGO 2014', 'ATA 2015'] },
            ].map((f) => (
              <div key={f.key}>
                <label className="onc-field-label" htmlFor={`onc-${f.key}`}>{f.label}</label>
                <select
                  id={`onc-${f.key}`}
                  className="onc-select"
                  value={filters[f.key]}
                  onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o === 'all' ? `All ${f.pluralLabel}` : o}</option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label className="onc-field-label">&nbsp;</label>
              <button
                className="onc-reset-btn"
                onClick={() => setFilters({ difficulty: 'all', broad_topic: 'all', source: 'all' })}
              >
                Reset filters
              </button>
            </div>
          </div>
        </div>

        {error && <div className="onc-error">Error: {error}</div>}
        {loading && <p className="onc-empty">Loading questions…</p>}
        {!loading && questions.length === 0 && !error && (
          <p className="onc-empty">No questions match your filters.</p>
        )}
        {!loading && questions.length > 0 && (
          <div className="onc-questions">
            {questions.map((q) => (
              <OncologyQuestionCard key={q.id} question={q} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
