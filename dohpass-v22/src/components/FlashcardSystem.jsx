import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, getProfile, hasAccess } from "../lib/supabase";
import { scheduleCard, RATING, RATING_CONFIG, isDue, nextReviewLabel } from "../lib/fsrs";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  concept: { label: "Concept", colorVar: "var(--blue)",  bgVar: "rgba(59,130,246,0.1)",  borderVar: "rgba(59,130,246,0.25)" },
  drug:    { label: "Drug",    colorVar: "var(--purple,#a78bfa)", bgVar: "rgba(167,139,250,0.1)", borderVar: "rgba(167,139,250,0.25)" },
  anatomy: { label: "Anatomy", colorVar: "var(--green)", bgVar: "rgba(34,197,94,0.1)",   borderVar: "rgba(34,197,94,0.25)" },
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const IconLock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const IconQuestions = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)
const IconFlashcards = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M8 4v16M2 9h6M2 15h6" />
  </svg>
)
const IconWarning = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

// ─── TEXT RENDERER ────────────────────────────────────────────────────────────
function renderBack(text) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const html = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (line.startsWith("·")) {
      return <div key={i} className="fc-back-bullet" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (line.trim() === "") return <div key={i} className="fc-back-spacer" />;
    return <div key={i} className="fc-back-line" dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="fcs-skeleton" />
  );
}

// Pre-compute next interval label for a given rating without mutating state
function previewLabel(fsrsData, rating) {
  try {
    const result = scheduleCard(fsrsData, rating)
    return nextReviewLabel(result.due_date)
  } catch { return '?' }
}

// ─── FLIP CARD ────────────────────────────────────────────────────────────────
function FlipCard({ card, fsrsData, onRate, saving }) {
  const [flipped, setFlipped] = useState(false);
  const cfg = TYPE_CONFIG[card.card_type] || TYPE_CONFIG.concept;
  useEffect(() => { setFlipped(false); }, [card.id]);

  return (
    <div
      className="fcs-flip-root"
      onClick={() => setFlipped(f => !f)}
    >
      <div
        className="fcs-flip-inner"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* FRONT */}
        <div
          className="fcs-face fcs-face--front"
          style={{
            borderColor: cfg.borderVar,
            boxShadow: `0 0 40px ${cfg.bgVar}`,
          }}
        >
          <div
            className="fcs-type-pill"
            style={{
              background: cfg.bgVar,
              borderColor: cfg.borderVar,
              color: cfg.colorVar,
            }}
          >
            {cfg.label}
          </div>
          <div className="fcs-subtopic">{card.subtopic}</div>
          <div className="fcs-front-body">
            <div className="fcs-front-text">{card.front}</div>
          </div>
          <div className="fcs-tap-hint">tap to reveal →</div>
        </div>

        {/* BACK */}
        <div
          className="fcs-face fcs-back"
          style={{
            borderColor: cfg.borderVar,
            boxShadow: `0 0 40px ${cfg.bgVar}`,
          }}
        >
          <div
            className="fcs-back-question"
            style={{ color: cfg.colorVar, borderBottomColor: cfg.borderVar }}
          >
            {card.front}
          </div>
          <div className="fcs-back-content">
            {renderBack(card.back)}
          </div>
          <div className="fcs-rate-row">
            {[RATING.AGAIN, RATING.HARD, RATING.GOOD, RATING.EASY].map(rating => {
              const rc = RATING_CONFIG[rating];
              return (
                <button
                  key={rating}
                  className="fcs-rate-btn"
                  onClick={e => { e.stopPropagation(); if (!saving) onRate(card.id, rating); }}
                  style={{
                    background: rc.bg,
                    borderColor: rc.border,
                    color: rc.color,
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                  disabled={saving}
                >
                  <span className="fcs-rate-label">{rc.label}</span>
                  <span className="fcs-rate-interval">{previewLabel(fsrsData, rating)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({ known, total }) {
  const pct = total === 0 ? 0 : Math.round((known / total) * 100);
  return (
    <div className="fcs-progress">
      <div className="fcs-progress__head">
        <span className="fcs-progress__label">Deck progress</span>
        <span className="fcs-progress__val">{known}/{total} · {pct}%</span>
      </div>
      <div className="fcs-progress__track">
        <div
          className="fcs-progress__fill"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── FILTER TABS ──────────────────────────────────────────────────────────────
function FilterTabs({ active, onChange }) {
  const tabs = [{ key: "all", label: "All" }, ...Object.entries(TYPE_CONFIG).map(([k, v]) => ({ key: k, label: v.label }))];
  return (
    <div className="fcs-filter-row">
      {tabs.map(t => {
        const cfg = t.key !== "all" ? TYPE_CONFIG[t.key] : null;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`fcs-filter-btn${isActive ? ' fcs-filter-btn--active' : ''}`}
            style={isActive ? {
              borderColor: cfg?.borderVar || 'var(--blue-border,rgba(59,130,246,0.4))',
              background: cfg?.bgVar || 'rgba(59,130,246,0.1)',
              color: cfg?.colorVar || 'var(--blue)',
            } : {}}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function FlashcardSystem({ userId = null, onSwitchTab }) {
  const { track, system: systemParam } = useParams();
  const navigate = useNavigate();

  const system = systemParam
    ? systemParam.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : "Neurology";

  const trackLabel = track === 'gp' ? 'General Practitioner' : 'Internal Medicine';

  const [activeTab,   setActiveTab]   = useState("flashcards");
  const [filter,      setFilter]      = useState("all");
  const [cards,       setCards]       = useState([]);
  const [fsrsMap,     setFsrsMap]     = useState(new Map());
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [isPaid,      setIsPaid]      = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then(p => { if (!cancelled) setIsPaid(hasAccess(p)); })
      .catch(() => { if (!cancelled) setIsPaid(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function fetchCards() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("flashcards")
        .select("*")
        .ilike("track", track)
        .ilike("system", systemParam)
        .eq("is_active", true)
        .order("id", { ascending: true });

      if (error) {
        setError("Could not load flashcards — check your connection.");
        console.error(error);
      } else {
        setCards(data || []);
      }
      setLoading(false);
    }
    fetchCards();
  }, [system, track]);

  useEffect(() => {
    if (!userId || cards.length === 0) return;
    async function fetchFsrsProgress() {
      const { data, error } = await supabase
        .from("flashcard_progress")
        .select("flashcard_id, is_known, stability, difficulty, due_date, last_review, reps, lapses, fsrs_state")
        .eq("user_id", userId)
        .in("flashcard_id", cards.map(c => c.id));

      if (!error && data) {
        const map = new Map();
        data.forEach(r => map.set(r.flashcard_id, r));
        setFsrsMap(map);
      }
    }
    fetchFsrsProgress();
  }, [userId, cards]);

  const rateCard = useCallback(async (cardId, rating) => {
    if (!userId || saving) return;
    const prev = fsrsMap.get(cardId) ?? null;
    const updates = scheduleCard(prev, rating);

    setFsrsMap(map => {
      const next = new Map(map);
      next.set(cardId, { ...(prev || {}), flashcard_id: cardId, ...updates });
      return next;
    });
    setSaving(true);

    const { error } = await supabase
      .from("flashcard_progress")
      .upsert(
        { user_id: userId, flashcard_id: cardId, ...updates },
        { onConflict: "user_id,flashcard_id" }
      );

    if (error) {
      setFsrsMap(map => {
        const next = new Map(map);
        prev ? next.set(cardId, prev) : next.delete(cardId);
        return next;
      });
      console.error("FSRS save error:", error);
    } else {
      setCurrentIdx(i => i + 1);
    }
    setSaving(false);
  }, [userId, saving, fsrsMap]);

  const baseFiltered = filter === "all" ? cards : cards.filter(c => c.card_type === filter);
  const filtered = [...baseFiltered].sort((a, b) => {
    const aRow = fsrsMap.get(a.id);
    const bRow = fsrsMap.get(b.id);
    const aDue = isDue(aRow) ? 0 : 1;
    const bDue = isDue(bRow) ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    const aDate = aRow?.due_date ? new Date(aRow.due_date).getTime() : 0;
    const bDate = bRow?.due_date ? new Date(bRow.due_date).getTime() : 0;
    return aDate - bDate;
  });
  const safeIdx    = Math.min(currentIdx, Math.max(0, filtered.length - 1));
  const knownCount = cards.filter(c => fsrsMap.get(c.id)?.is_known).length;
  const dueCount   = filtered.filter(c => isDue(fsrsMap.get(c.id))).length;
  const pct        = cards.length === 0 ? 0 : Math.round((knownCount / cards.length) * 100);
  const displaySystem = cards[0]?.system || system;

  const handleFilter    = (f) => { setFilter(f); setCurrentIdx(0); };
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'questions') navigate('/' + (track || 'specialist'));
  };

  return (
    <div className="fcs-root">
      {/* HEADER */}
      <div className="fcs-header">
        <div className="fcs-breadcrumb">
          DOHPass / {trackLabel} / <span className="fcs-breadcrumb__active">{track === 'gp' ? 'GP Flashcards' : displaySystem}</span>
        </div>
        <div className="fcs-header__row">
          <div>
            <h1 className="fcs-title">{track === 'gp' ? 'General Practitioner' : displaySystem}</h1>
            <div className="fcs-meta">
              {loading ? "Loading…" : `${cards.length} flashcards`}
              {!loading && dueCount > 0 && (
                <span className="fcs-meta__due"> · {dueCount} due</span>
              )}
              {!userId && <span className="fcs-meta__guest"> · guest mode</span>}
            </div>
          </div>
          <div className="fcs-known-badge">
            <div className="fcs-known-badge__pct">{pct}%</div>
            <div className="fcs-known-badge__label">Known</div>
          </div>
        </div>
        <div className="fcs-tabs">
          {[
            { key: "questions",  icon: <IconQuestions />,  label: "Questions" },
            { key: "flashcards", icon: <IconFlashcards />, label: "Flashcards" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabSwitch(tab.key)}
              className={`fcs-tab${activeTab === tab.key ? ' fcs-tab--active' : ''}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* FLASHCARDS TAB */}
      {activeTab === "flashcards" && (
        <div className="fcs-body">
          {isPaid === false && (
            <div className="fcs-paywall-banner">
              <span className="fcs-paywall-banner__text">
                <IconLock /> Free preview — upgrade to unlock all flashcards in this system.
              </span>
              <button className="fcs-paywall-banner__cta" onClick={() => navigate('/pricing')}>
                Upgrade
              </button>
            </div>
          )}
          {error && (
            <div className="fcs-error">
              <IconWarning /> {error}
            </div>
          )}

          {!loading && <ProgressBar known={knownCount} total={cards.length} />}
          <FilterTabs active={filter} onChange={handleFilter} />

          {loading ? <Skeleton /> : filtered.length === 0 ? (
            <div className="fcs-empty">No cards in this filter.</div>
          ) : (
            <>
              <div className="fcs-counter">{safeIdx + 1} / {filtered.length}</div>

              <FlipCard
                key={filtered[safeIdx]?.id}
                card={filtered[safeIdx]}
                fsrsData={fsrsMap.get(filtered[safeIdx]?.id) ?? null}
                onRate={rateCard}
                saving={saving}
              />

              <div className="fcs-nav-row">
                {[
                  { label: "← Prev", disabled: safeIdx === 0,                       onClick: () => setCurrentIdx(i => Math.max(0, i - 1)),                  mod: "prev" },
                  { label: "Next →", disabled: safeIdx === filtered.length - 1,     onClick: () => setCurrentIdx(i => Math.min(filtered.length - 1, i + 1)), mod: "next" },
                ].map(btn => (
                  <button
                    key={btn.label}
                    onClick={btn.onClick}
                    disabled={btn.disabled}
                    className={`fcs-nav-btn fcs-nav-btn--${btn.mod}${btn.disabled ? ' fcs-nav-btn--disabled' : ''}`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {isPaid === false && safeIdx === filtered.length - 1 && filtered.length > 0 && (
                <div className="fcs-preview-end">
                  <p className="fcs-preview-end__text">That's the end of the free preview.</p>
                  <button className="fcs-preview-end__cta" onClick={() => navigate('/pricing')}>
                    Upgrade to see the full deck
                  </button>
                </div>
              )}

              <div className="fcs-overview">
                <div className="fcs-overview__label">Deck overview</div>
                <div className="fcs-overview__grid">
                  {filtered.map((c, i) => {
                    const cfg = TYPE_CONFIG[c.card_type] || TYPE_CONFIG.concept;
                    const isActive = i === safeIdx;
                    const isKnown  = fsrsMap.get(c.id)?.is_known ?? false;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCurrentIdx(i)}
                        className={`fcs-dot${isActive ? ' fcs-dot--active' : ''}${isKnown ? ' fcs-dot--known' : ''}`}
                        style={isActive ? {
                          borderColor: cfg.borderVar,
                          background: cfg.bgVar,
                          color: cfg.colorVar,
                        } : {}}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* QUESTIONS TAB */}
      {activeTab === "questions" && (
        <div className="fcs-questions-empty">
          <IconQuestions />
          <div className="fcs-questions-empty__title">Questions Mode</div>
          <div className="fcs-questions-empty__sub">Your existing question bank loads here.</div>
        </div>
      )}
    </div>
  );
}
