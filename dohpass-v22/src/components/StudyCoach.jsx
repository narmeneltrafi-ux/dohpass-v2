import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function hasAccess(profile) {
  if (!profile?.access_expires_at) return false;
  return new Date(profile.access_expires_at) > new Date();
}

function formatBold(text) {
  if (!text) return "";
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

const IconRefresh = ({ spinning }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
    style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}
  >
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

export default function StudyCoach({ profile, track = "specialist" }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "coach", track }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) { setRateLimited(true); setError("Daily AI limit reached. Check back tomorrow."); }
        else if (res.status === 403) setError("paywall");
        else setError(body.message ?? "Could not load plan.");
        return;
      }
      const data = await res.json();
      setPlan(data.plan ?? []);
    } catch { setError("Connection error. Please try again."); }
    finally { setLoading(false); }
  }, [track]);

  useEffect(() => { if (hasAccess(profile)) fetchPlan(); }, []);

  if (!hasAccess(profile)) {
    return (
      <div className="sc-card sc-card--locked">
        <h3 className="sc-title">AI Study Coach</h3>
        <p className="sc-body">
          Get a personalised daily study plan based on your weakest topics.{' '}
          <a href="/pricing" className="sc-link">Upgrade to unlock</a>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="sc-card">
        <div className="sc-head">
          <h3 className="sc-title">Today's Study Plan</h3>
        </div>
        <div className="sc-skeleton-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="sc-skeleton-row">
              <div className="sc-skeleton-dot" />
              <div className="sc-skeleton-lines">
                <div className="sc-skeleton-line sc-skeleton-line--full" />
                <div className="sc-skeleton-line sc-skeleton-line--two-thirds" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && error !== "paywall") {
    return (
      <div className="sc-card sc-card--error">
        <div className="sc-head">
          <h3 className="sc-title">Today's Study Plan</h3>
        </div>
        <p className="sc-error-msg">{error}</p>
        {!rateLimited && (
          <button onClick={fetchPlan} className="sc-retry">Try again</button>
        )}
      </div>
    );
  }

  return (
    <div className="sc-card">
      <div className="sc-head">
        <h3 className="sc-title">Today's Study Plan</h3>
        <button
          onClick={fetchPlan}
          disabled={loading}
          title="Refresh plan"
          className="sc-refresh"
          aria-label="Refresh study plan"
        >
          <IconRefresh spinning={loading} />
        </button>
      </div>
      {plan && plan.length > 0 ? (
        <ol className="sc-plan-list">
          {plan.map((bullet, i) => (
            <li key={i} className="sc-plan-item">
              <span className="sc-plan-num">{i + 1}</span>
              <p
                className="sc-plan-text"
                dangerouslySetInnerHTML={{ __html: formatBold(bullet) }}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="sc-empty">No plan generated. Try refreshing.</p>
      )}
      <p className="sc-footnote">Based on your recent quiz performance · Powered by AI</p>
    </div>
  );
}
