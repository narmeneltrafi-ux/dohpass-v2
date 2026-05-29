import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function hasAccess(profile) {
  if (!profile?.access_expires_at) return false;
  return new Date(profile.access_expires_at) > new Date();
}

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
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5">
        <div className="flex items-center gap-2 mb-2"><span className="text-xl">📋</span><h3 className="text-sm font-semibold text-indigo-800">AI Study Coach</h3></div>
        <p className="text-sm text-indigo-600">Get a personalised daily study plan based on your weakest topics. <a href="/pricing" className="underline font-medium">Upgrade to unlock</a></p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4"><span className="text-xl">📋</span><h3 className="text-sm font-semibold text-gray-800">Today's Study Plan</h3></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-indigo-100 flex-shrink-0 animate-pulse mt-0.5" />
              <div className="flex-1 space-y-1.5"><div className="h-3 bg-gray-100 rounded animate-pulse w-full" /><div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && error !== "paywall") {
    return (
      <div className="rounded-xl border border-orange-100 bg-orange-50 p-5">
        <div className="flex items-center gap-2 mb-2"><span className="text-xl">📋</span><h3 className="text-sm font-semibold text-orange-800">Today's Study Plan</h3></div>
        <p className="text-sm text-orange-700 mb-3">{error}</p>
        {!rateLimited && <button onClick={fetchPlan} className="text-xs font-medium text-orange-700 underline hover:text-orange-900">Try again</button>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><span className="text-xl">📋</span><h3 className="text-sm font-semibold text-gray-800">Today's Study Plan</h3></div>
        <button onClick={fetchPlan} disabled={loading} title="Refresh plan" className="text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-40" aria-label="Refresh study plan">
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      {plan && plan.length > 0 ? (
        <ol className="space-y-3">
          {plan.map((bullet, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <p className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatBold(bullet) }} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-500">No plan generated. Try refreshing.</p>
      )}
      <p className="mt-4 text-xs text-gray-400">Based on your recent quiz performance · Powered by AI</p>
    </div>
  );
}

function formatBold(text) {
  if (!text) return "";
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
