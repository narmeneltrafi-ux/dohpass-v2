import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const DAILY_LIMIT = 20;

function hasAccess(profile) {
  if (!profile?.access_expires_at) return false;
  return new Date(profile.access_expires_at) > new Date();
}

export default function AiTutorChat({ question, profile, track = "specialist" }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const bottomRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (open && messages.length === 0 && question) {
      const seed = `I just answered a question about **${question.topic}**. Can you explain the key concept tested here and help me understand why the correct answer is correct?`;
      setMessages([{ role: "user", content: seed }]);
      sendMessages([{ role: "user", content: seed }]);
    }
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function sendMessages(msgHistory) {
    setStreaming(true);
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    try {
      const token = await getToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "tutor", messages: msgHistory, track, questionId: question?.id }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "paywall") setError("paywall");
        else if (body.error === "rate_limit") setError("rate_limit");
        else setError(body.message ?? "Something went wrong.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.type === "delta") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: updated[updated.length - 1].content + evt.text };
              return updated;
            });
          } else if (evt.type === "done") {
            if (typeof evt.remaining === "number") setRemaining(evt.remaining);
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") { setError("Connection error. Please try again."); setMessages((prev) => prev.slice(0, -1)); }
    } finally { setStreaming(false); }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    await sendMessages(next.slice(-8));
  }

  function handleKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }

  if (!hasAccess(profile)) {
    return (
      <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-medium text-indigo-800">🎓 <strong>AI Tutor</strong> — Ask follow-up questions about any explanation</p>
        <p className="mt-1 text-sm text-indigo-600">Available to active subscribers. <a href="/pricing" className="underline font-medium">Upgrade to unlock</a></p>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors w-full">
        <span className="text-lg">🎓</span>
        <span>Ask Dr. Tutor about this question</span>
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-white shadow-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100 bg-indigo-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎓</span>
          <span className="text-sm font-semibold text-indigo-800">Dr. Tutor</span>
          {remaining !== null && <span className="text-xs text-indigo-400">{remaining}/{DAILY_LIMIT} left today</span>}
        </div>
        <button onClick={() => setOpen(false)} className="text-indigo-400 hover:text-indigo-600 text-lg leading-none" aria-label="Close tutor">×</button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-80 px-4 py-3 space-y-3 text-sm">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 whitespace-pre-wrap leading-relaxed ${msg.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}
              dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
          </div>
        ))}
        {streaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl rounded-bl-sm px-3 py-2">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        {error === "rate_limit" && <div className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 text-center">Daily limit reached ({DAILY_LIMIT} requests). Resets at midnight UTC.</div>}
        {error && error !== "rate_limit" && error !== "paywall" && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-gray-100 px-3 py-2 flex gap-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask a follow-up question…" rows={1} disabled={streaming || error === "rate_limit"}
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-50" style={{ minHeight: "2.25rem", maxHeight: "5rem" }} />
        <button onClick={handleSend} disabled={streaming || !input.trim() || error === "rate_limit"}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0">
          {streaming ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

function formatMarkdown(text) {
  if (!text) return "";
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n/g, "<br />");
}
