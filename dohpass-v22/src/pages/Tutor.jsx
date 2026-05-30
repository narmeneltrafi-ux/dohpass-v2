import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getProfile, fetchWeakTopics, fetchFlashcardDueCount, fetchOverallProgress } from '../lib/supabase'
import AppNav from '../components/AppNav.jsx'

/* ── Inline message renderer ──────────────────────────────────────
   Escapes HTML first, then applies **bold**, `code`, and newlines.
   Safe to use with dangerouslySetInnerHTML since all user-supplied
   text is HTML-escaped before any substitution runs.
   ─────────────────────────────────────────────────────────────── */
function renderHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/* ── Icons ────────────────────────────────────────────────────── */
const IconSend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2L11 13" />
    <path d="M22 2L15 22 11 13 2 9l20-7z" />
  </svg>
)
const IconBot = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
  </svg>
)
const IconTarget = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
)
const IconFlash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)
const IconAccuracy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

/* ── Single streaming message bubble ─────────────────────────── */
function MsgBubble({ msg }) {
  const isUser = msg.role === 'user'

  // Show thinking dots while waiting for the first content token
  if (!isUser && msg.streaming && !msg.content) {
    return (
      <div className="tutor-msg tutor-msg--assistant">
        <span className="tutor-msg__avatar" aria-hidden="true"><IconBot /></span>
        <div className="tutor-bubble tutor-bubble--assistant tutor-bubble--thinking">
          <span className="tutor-dot" /><span className="tutor-dot" /><span className="tutor-dot" />
        </div>
      </div>
    )
  }

  const html = renderHtml(msg.content)
  return (
    <div className={`tutor-msg tutor-msg--${msg.role}`}>
      {!isUser && (
        <span className="tutor-msg__avatar" aria-hidden="true">
          <IconBot />
        </span>
      )}
      <div
        className={`tutor-bubble tutor-bubble--${msg.role}`}
        dangerouslySetInnerHTML={{
          __html: html + (msg.streaming ? '<span class="tutor-cursor" aria-hidden="true"></span>' : '')
        }}
      />
    </div>
  )
}

/* ── Track toggle ─────────────────────────────────────────────── */
function TrackToggle({ track, onChange }) {
  return (
    <div className="tutor-track-toggle" role="radiogroup" aria-label="Question track">
      {['specialist', 'gp'].map(t => (
        <button
          key={t}
          className={`tutor-track-btn${track === t ? ' tutor-track-btn--active' : ''}`}
          onClick={() => onChange(t)}
          role="radio"
          aria-checked={track === t}
          type="button"
        >
          {t === 'specialist' ? 'Specialist' : 'GP'}
        </button>
      ))}
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function Tutor() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [track, setTrack] = useState('specialist')
  const [weakTopics, setWeakTopics] = useState([])
  const [dueCount, setDueCount] = useState(0)
  const [overallPct, setOverallPct] = useState(null)
  const msgsEndRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)

  /* ── Load user context ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    Promise.all([getProfile(), fetchFlashcardDueCount(), fetchOverallProgress()]).then(
      async ([p, due, overall]) => {
        if (cancelled) return
        setProfile(p)
        setDueCount(due ?? 0)
        if (overall?.answered > 0) {
          setOverallPct(Math.round((overall.correct / overall.answered) * 100))
        }
        const defaultTrack = p?.diagnostic_track || 'specialist'
        setTrack(defaultTrack)
        const topics = await fetchWeakTopics(defaultTrack)
        if (!cancelled) setWeakTopics(topics)
      }
    )
    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [])

  /* ── Auto-scroll to latest message ─────────────────────────── */
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Auto-resize textarea ───────────────────────────────────── */
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [input])

  /* ── Personalised suggested prompts ───────────────────────── */
  const suggestedPrompts = useMemo(() => {
    const base = [
      'What are my weakest topics and how should I study them?',
      'Explain the management of acute decompensated heart failure',
      'Quiz me on Cardiology',
      "What's the DOH pass mark and how is the exam structured?",
    ]
    if (weakTopics.length > 0) {
      return [
        `Quiz me on ${weakTopics[0].topic}`,
        `Explain the key exam concepts in ${weakTopics[0].topic}`,
        base[0],
        base[2],
      ]
    }
    return base
  }, [weakTopics])

  /* ── Core send / stream logic ──────────────────────────────── */
  const sendMessage = useCallback(
    async (text) => {
      const userText = text.trim()
      if (!userText || isStreaming) return

      const userMsg = { id: Date.now(), role: 'user', content: userText }
      const assistantId = Date.now() + 1
      const assistantMsg = { id: assistantId, role: 'assistant', content: '', streaming: true }

      setMessages(prev => [...prev, userMsg, assistantMsg])
      setInput('')
      setIsStreaming(true)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        // Build history: previous messages + new user message, non-empty only
        const history = [...messages, userMsg]
          .filter(m => m.content.trim().length > 0)
          .slice(-20)
          .map(m => ({ role: m.role, content: m.content }))

        const controller = new AbortController()
        abortRef.current = controller

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ messages: history, track }),
            signal: controller.signal,
          }
        )

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const events = buf.split('\n\n')
          buf = events.pop() ?? ''
          for (const ev of events) {
            if (!ev.startsWith('data: ')) continue
            try {
              const parsed = JSON.parse(ev.slice(6))
              if (parsed.type === 'delta') {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, content: m.content + parsed.text }
                      : m
                  )
                )
              } else if (parsed.type === 'done') {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId ? { ...m, streaming: false } : m
                  )
                )
              }
            } catch {
              // malformed SSE frame — skip
            }
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          const content = err?.message === 'HTTP 401'
            ? 'Session expired — please refresh the page.'
            : 'Something went wrong — please try again.'
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    content,
                    streaming: false,
                  }
                : m
            )
          )
        }
      } finally {
        setIsStreaming(false)
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m))
        )
      }
    },
    [messages, track, isStreaming]
  )

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleTrackChange = (t) => {
    setTrack(t)
    fetchWeakTopics(t).then(setWeakTopics)
  }

  const isEmpty = messages.length === 0
  const handleNewChat = () => setMessages([])

  return (
    <div className="tutor-root">
      <AppNav />

      <div className="tutor-body">
        {/* ── Context sidebar ─────────────────────────────────── */}
        <aside className="tutor-sidebar" aria-label="Your progress context">
          <div className="tutor-ctx">
            <p className="tutor-ctx__heading">Context</p>

            {overallPct !== null && (
              <div className="tutor-ctx__row">
                <span className="tutor-ctx__row-icon tutor-ctx__row-icon--blue">
                  <IconAccuracy />
                </span>
                <div>
                  <span className="tutor-ctx__row-label">Overall accuracy</span>
                  <span className="tutor-ctx__row-val">{overallPct}%</span>
                </div>
              </div>
            )}

            {dueCount > 0 && (
              <div className="tutor-ctx__row">
                <span className="tutor-ctx__row-icon tutor-ctx__row-icon--amber">
                  <IconFlash />
                </span>
                <div>
                  <span className="tutor-ctx__row-label">Flashcards due</span>
                  <span className="tutor-ctx__row-val">{dueCount} cards</span>
                </div>
              </div>
            )}

            {weakTopics.length > 0 && (
              <div className="tutor-ctx__section">
                <p className="tutor-ctx__section-label">
                  <IconTarget /> Weak topics
                </p>
                {weakTopics.map(t => (
                  <div key={t.topic} className="tutor-ctx__topic">
                    <span className="tutor-ctx__topic-name">{t.topic}</span>
                    <span
                      className="tutor-ctx__topic-pct"
                      style={{ color: t.accuracy < 50 ? '#ef4444' : '#f97316' }}
                    >
                      {t.accuracy}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="tutor-ctx__section">
              <p className="tutor-ctx__section-label">Track</p>
              <TrackToggle track={track} onChange={handleTrackChange} />
            </div>
          </div>
        </aside>

        {/* ── Main chat area ──────────────────────────────────── */}
        <main className="tutor-main">
          {/* Topbar: title + new-chat action */}
          <div className="tutor-topbar">
            <span className="tutor-topbar__title">
              <span className="tutor-topbar__mark" aria-hidden="true">✦</span>
              Dr. Tutor
            </span>
            {!isEmpty && (
              <button
                type="button"
                className="tutor-topbar__new"
                onClick={handleNewChat}
                disabled={isStreaming}
                aria-label="Start a new conversation"
              >
                New chat
              </button>
            )}
          </div>

          <div className="tutor-msgs" role="log" aria-live="polite" aria-label="Conversation with Dr. Tutor">

            {isEmpty && (
              <div className="tutor-welcome">
                <div className="tutor-welcome__mark" aria-hidden="true">✦</div>
                <h1 className="tutor-welcome__h">Dr. Tutor</h1>
                <p className="tutor-welcome__sub">
                  Your personal DOH exam coach — powered by your actual progress data.
                  Ask anything, get quizzed, or dig into a weak topic.
                </p>
                <div className="tutor-prompts" role="list">
                  {suggestedPrompts.map(p => (
                    <button
                      key={p}
                      className="tutor-prompt"
                      onClick={() => sendMessage(p)}
                      role="listitem"
                      type="button"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <MsgBubble key={msg.id} msg={msg} />
            ))}

            <div ref={msgsEndRef} aria-hidden="true" />
          </div>

          {/* Mobile-only track toggle (sidebar hidden at <768px) */}
          <div className="tutor-mobile-track" aria-label="Question track">
            <span className="tutor-mobile-track__label">Track:</span>
            <TrackToggle track={track} onChange={handleTrackChange} />
          </div>

          {/* ── Input bar ───────────────────────────────────── */}
          <form
            className="tutor-bar"
            onSubmit={e => { e.preventDefault(); sendMessage(input) }}
            aria-label="Send a message"
          >
            <textarea
              ref={textareaRef}
              className="tutor-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your DOH exam… (Shift+Enter for new line)"
              rows={1}
              disabled={isStreaming}
              aria-label="Your message"
              aria-multiline="true"
            />
            <button
              type="submit"
              className={`tutor-send${!input.trim() || isStreaming ? ' tutor-send--disabled' : ''}`}
              disabled={!input.trim() || isStreaming}
              aria-label="Send"
            >
              <IconSend />
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}
