import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, getProfile } from "../lib/supabase";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  concept: { label: "Concept", color: "#4FC3F7", bg: "rgba(79,195,247,0.12)" },
  drug:    { label: "Drug",    color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  anatomy: { label: "Anatomy", color: "#34D399", bg: "rgba(52,211,153,0.12)" },
};

// ─── TEXT RENDERER ────────────────────────────────────────────────────────────
function renderBack(text) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const html = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (line.startsWith("·")) {
      return <div key={i} style={{ paddingLeft: 16, color: "#CBD5E1", fontSize: 13, lineHeight: "1.75" }} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
    return <div key={i} style={{ color: "#E2E8F0", fontSize: 13, lineHeight: "1.75" }} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{
        width: "100%", height: 340, borderRadius: 16,
        background: "linear-gradient(90deg,#0F172A 25%,#1E293B 50%,#0F172A 75%)",
        backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite",
      }} />
    </>
  );
}

// ─── FLIP CARD ────────────────────────────────────────────────────────────────
function FlipCard({ card, isKnown, onToggleKnown, saving }) {
  const [flipped, setFlipped] = useState(false);
  const cfg = TYPE_CONFIG[card.card_type] || TYPE_CONFIG.concept;
  useEffect(() => { setFlipped(false); }, [card.id]);

  return (
    <div onClick={() => setFlipped(f => !f)} style={{ cursor: "pointer", perspective: 1000, width: "100%", height: 340, userSelect: "none" }}>
      <div style={{
        position: "relative", width: "100%", height: "100%",
        transformStyle: "preserve-3d",
        transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1)",
        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
      }}>

        {/* FRONT */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          background: "linear-gradient(135deg,#0F172A 0%,#1E293B 100%)",
          border: `1px solid ${cfg.color}30`, borderRadius: 16,
          display: "flex", flexDirection: "column", padding: 24,
          boxShadow: `0 0 40px ${cfg.color}15`,
        }}>
          <div style={{
            alignSelf: "flex-start", background: cfg.bg, border: `1px solid ${cfg.color}40`,
            borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", color: cfg.color,
            fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase", marginBottom: 12,
          }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 16 }}>
            {card.subtopic}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: "#F1F5F9", textAlign: "center", lineHeight: 1.4 }}>
              {card.front}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "#334155", fontFamily: "'IBM Plex Mono',monospace", marginTop: 12 }}>
            tap to reveal →
          </div>
        </div>

        {/* BACK */}
        <div style={{
          position: "absolute", inset: 0, backfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          background: "linear-gradient(135deg,#0F172A 0%,#1A2744 100%)",
          border: `1px solid ${cfg.color}40`, borderRadius: 16,
          display: "flex", flexDirection: "column", padding: 20,
          boxShadow: `0 0 40px ${cfg.color}20`,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: cfg.color,
            fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase",
            letterSpacing: "0.08em", marginBottom: 14,
            borderBottom: `1px solid ${cfg.color}20`, paddingBottom: 10,
          }}>
            {card.front}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renderBack(card.back)}
          </div>
          <div
            onClick={e => { e.stopPropagation(); if (!saving) onToggleKnown(card.id, isKnown); }}
            style={{
              marginTop: 14, padding: "9px 0", borderRadius: 8, textAlign: "center",
              fontSize: 12, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace",
              letterSpacing: "0.06em",
              background: isKnown ? "rgba(52,211,153,0.15)" : "rgba(100,116,139,0.15)",
              border: `1px solid ${isKnown ? "#34D399" : "#475569"}`,
              color: isKnown ? "#34D399" : "#94A3B8",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.6 : 1, transition: "all 0.2s",
            }}>
            {saving ? "Saving..." : isKnown ? "✓ Got it" : "Mark as known"}
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
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#64748B", fontFamily: "'IBM Plex Mono',monospace" }}>DECK PROGRESS</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399", fontFamily: "'IBM Plex Mono',monospace" }}>
          {known}/{total} · {pct}%
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "#1E293B", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#34D399,#4FC3F7)", borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// ─── FILTER TABS ──────────────────────────────────────────────────────────────
function FilterTabs({ active, onChange }) {
  const tabs = [{ key: "all", label: "All" }, ...Object.entries(TYPE_CONFIG).map(([k, v]) => ({ key: k, label: v.label }))];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
      {tabs.map(t => {
        const cfg = t.key !== "all" ? TYPE_CONFIG[t.key] : null;
        const isActive = active === t.key;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace",
            border: `1px solid ${isActive ? (cfg?.color || "#4FC3F7") : "#1E293B"}`,
            background: isActive ? (cfg?.bg || "rgba(79,195,247,0.12)") : "transparent",
            color: isActive ? (cfg?.color || "#4FC3F7") : "#475569",
            transition: "all 0.2s",
          }}>
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
  const [knownIds,    setKnownIds]    = useState(new Set());
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  // null = loading, true = paid, false = free
  const [isPaid,      setIsPaid]      = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then(p => { if (!cancelled) setIsPaid(p?.is_paid === true); })
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
        .eq(track === 'gp' ? "track" : "system", track === 'gp' ? "GP" : system)
        .eq("is_active", true)
        .order("id", { ascending: true });

      if (error) {
        setError("Could not load flashcards — check Supabase connection.");
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
    async function fetchProgress() {
      const { data, error } = await supabase
        .from("flashcard_progress")
        .select("flashcard_id, is_known")
        .eq("user_id", userId)
        .in("flashcard_id", cards.map(c => c.id));

      if (!error) {
        setKnownIds(new Set((data || []).filter(r => r.is_known).map(r => r.flashcard_id)));
      }
    }
    fetchProgress();
  }, [userId, cards]);

  const toggleKnown = useCallback(async (cardId, currentlyKnown) => {
    setKnownIds(prev => {
      const next = new Set(prev);
      currentlyKnown ? next.delete(cardId) : next.add(cardId);
      return next;
    });

    if (!userId) return;

    setSaving(true);
    const { error } = await supabase
      .from("flashcard_progress")
      .upsert(
        { user_id: userId, flashcard_id: cardId, is_known: !currentlyKnown, marked_at: new Date().toISOString() },
        { onConflict: "user_id,flashcard_id" }
      );

    if (error) {
      setKnownIds(prev => {
        const next = new Set(prev);
        currentlyKnown ? next.add(cardId) : next.delete(cardId);
        return next;
      });
      console.error("Save error:", error);
    }
    setSaving(false);
  }, [userId]);

  const filtered   = filter === "all" ? cards : cards.filter(c => c.card_type === filter);
  const safeIdx    = Math.min(currentIdx, Math.max(0, filtered.length - 1));
  const knownCount = cards.filter(c => knownIds.has(c.id)).length;
  const pct        = cards.length === 0 ? 0 : Math.round((knownCount / cards.length) * 100);

  const handleFilter    = (f) => { setFilter(f); setCurrentIdx(0); };
  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'questions') navigate('/' + (track || 'specialist'));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#060E1A", fontFamily: "'IBM Plex Sans',sans-serif", color: "#E2E8F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0F172A}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid #0F2040", padding: "20px 24px 0", background: "linear-gradient(180deg,#0A1628 0%,#060E1A 100%)" }}>
        <div style={{ fontSize: 11, color: "#334155", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          DOHPass / {trackLabel} / <span style={{ color: "#4FC3F7" }}>{track === 'gp' ? 'GP Flashcards' : system}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, fontFamily: "'Playfair Display',serif", color: "#F1F5F9" }}>{track === 'gp' ? 'General Practitioner' : system}</h1>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4, fontFamily: "'IBM Plex Mono',monospace" }}>
              {loading ? "Loading..." : `${cards.length} flashcards`}
              {!userId && <span style={{ color: "#334155" }}> · guest mode</span>}
            </div>
          </div>
          <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 10, padding: "8px 16px", textAlign: "center", minWidth: 70 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#34D399", fontFamily: "'IBM Plex Mono',monospace" }}>{pct}%</div>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "'IBM Plex Mono',monospace" }}>KNOWN</div>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          {["questions", "flashcards"].map(tab => (
            <button key={tab} onClick={() => handleTabSwitch(tab)} style={{
              padding: "10px 24px", background: "transparent", border: "none",
              borderBottom: activeTab === tab ? "2px solid #4FC3F7" : "2px solid transparent",
              color: activeTab === tab ? "#4FC3F7" : "#475569",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase",
              letterSpacing: "0.08em", transition: "all 0.2s",
            }}>
              {tab === "questions" ? "📋 Questions" : "🗂 Flashcards"}
            </button>
          ))}
        </div>
      </div>

      {/* FLASHCARDS TAB */}
      {activeTab === "flashcards" && (
        <div style={{ padding: "24px", maxWidth: 680, margin: "0 auto" }}>
          {isPaid === false && (
            <div style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              marginBottom: 20,
              padding: "12px 16px",
              background: "linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%)",
              border: "1px solid rgba(251, 191, 36, 0.4)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              backdropFilter: "blur(6px)",
            }}>
              <div style={{
                fontSize: 13,
                color: "#FBBF24",
                fontFamily: "'IBM Plex Mono',monospace",
                flex: 1,
                minWidth: 200,
              }}>
                🔒 Free preview mode. Upgrade to unlock all flashcards in this system.
              </div>
              <button onClick={() => navigate('/pricing')} style={{
                padding: "8px 18px",
                borderRadius: 8,
                background: "#FBBF24",
                border: "none",
                color: "#0F172A",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "'IBM Plex Mono',monospace",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>
                Upgrade
              </button>
            </div>
          )}
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: "#FCA5A5", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}>
              ⚠ {error}
            </div>
          )}

          {!loading && <ProgressBar known={knownCount} total={cards.length} />}
          <FilterTabs active={filter} onChange={handleFilter} />

          {loading ? <Skeleton /> : filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "#334155", padding: 60, fontFamily: "'IBM Plex Mono',monospace" }}>No cards in this filter.</div>
          ) : (
            <>
              <div style={{ textAlign: "center", fontSize: 11, color: "#334155", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 16 }}>
                {safeIdx + 1} / {filtered.length}
              </div>

              <FlipCard
                key={filtered[safeIdx]?.id}
                card={filtered[safeIdx]}
                isKnown={knownIds.has(filtered[safeIdx]?.id)}
                onToggleKnown={toggleKnown}
                saving={saving}
              />

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                {[
                  { label: "← Prev", disabled: safeIdx === 0, onClick: () => setCurrentIdx(i => Math.max(0, i - 1)), activeColor: "#94A3B8", activeBg: "rgba(30,41,59,1)" },
                  { label: "Next →", disabled: safeIdx === filtered.length - 1, onClick: () => setCurrentIdx(i => Math.min(filtered.length - 1, i + 1)), activeColor: "#4FC3F7", activeBg: "rgba(79,195,247,0.1)" },
                ].map(btn => (
                  <button key={btn.label} onClick={btn.onClick} disabled={btn.disabled} style={{
                    flex: 1, padding: "12px 0", borderRadius: 10,
                    background: btn.disabled ? "rgba(30,41,59,0.3)" : btn.activeBg,
                    border: `1px solid ${btn.disabled ? "#1E2940" : btn.activeColor + "30"}`,
                    color: btn.disabled ? "#1E2940" : btn.activeColor,
                    fontSize: 13, fontWeight: 600, cursor: btn.disabled ? "default" : "pointer",
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}>
                    {btn.label}
                  </button>
                ))}
              </div>

              {isPaid === false && safeIdx === filtered.length - 1 && filtered.length > 0 && (
                <div style={{
                  marginTop: 24,
                  padding: "18px 20px",
                  background: "linear-gradient(135deg, rgba(251, 191, 36, 0.18) 0%, rgba(251, 191, 36, 0.06) 100%)",
                  border: "1px solid rgba(251, 191, 36, 0.5)",
                  borderRadius: 12,
                  textAlign: "center",
                }}>
                  <div style={{
                    fontSize: 13,
                    color: "#FBBF24",
                    fontFamily: "'IBM Plex Mono',monospace",
                    marginBottom: 12,
                    letterSpacing: "0.04em",
                  }}>
                    That's the end of the free preview.
                  </div>
                  <button onClick={() => navigate('/pricing')} style={{
                    padding: "10px 24px",
                    borderRadius: 8,
                    background: "#FBBF24",
                    border: "none",
                    color: "#0F172A",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'IBM Plex Mono',monospace",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}>
                    Upgrade to see the full deck
                  </button>
                </div>
              )}

              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 11, color: "#334155", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                  Deck Overview
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {filtered.map((c, i) => {
                    const cfg = TYPE_CONFIG[c.card_type] || TYPE_CONFIG.concept;
                    const isActive = i === safeIdx;
                    const isKnown  = knownIds.has(c.id);
                    return (
                      <button key={c.id} onClick={() => setCurrentIdx(i)} style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: isKnown ? "rgba(52,211,153,0.2)" : isActive ? cfg.bg : "rgba(15,23,42,1)",
                        border: `1px solid ${isActive ? cfg.color : isKnown ? "#34D39940" : "#1E293B"}`,
                        cursor: "pointer", fontSize: 9, fontWeight: 700,
                        color: isActive ? cfg.color : isKnown ? "#34D399" : "#334155",
                        fontFamily: "'IBM Plex Mono',monospace", transition: "all 0.15s",
                      }}>
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
        <div style={{ padding: 48, textAlign: "center", color: "#334155", fontFamily: "'IBM Plex Mono',monospace" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 14, color: "#475569", marginBottom: 8 }}>Questions Mode</div>
          <div style={{ fontSize: 12 }}>Your existing question bank loads here.</div>
        </div>
      )}
    </div>
  );
}