// First-touch attribution + minimal funnel events.
//
// - First touch (UTM params, referrer host, landing path) is captured once per
//   browser and attached to the account at signup (auth user_metadata), so every
//   signup can be traced to a channel.
// - Funnel events go to the log_funnel_event RPC (SECURITY DEFINER, whitelisted
//   event names, size-capped). No third-party trackers, no IP, no user agent.
// - Every storage access is wrapped: private mode / blocked storage must never
//   break the page. Every network call is fire-and-forget.
import { supabase } from './supabase'

const FT_KEY = 'dp_first_touch'
const ANON_KEY = 'dp_anon_id'
const SESSION_PREFIX = 'dp_evt_'

export const FUNNEL_EVENTS = [
  'landing_view',
  'demo_first_answer',
  'demo_complete',
  'signup_view',
  'signup_submitted',
  'pricing_view',
  'checkout_view',
  'order_placed',
]

// View events fire at most once per browser session (dedupes re-renders and
// back/forward navigation). Action events fire every time they happen.
const ONCE_PER_SESSION = new Set(['landing_view', 'signup_view', 'pricing_view', 'checkout_view', 'demo_first_answer', 'demo_complete'])

function safeGet(store, key) {
  try { return store.getItem(key) } catch { return null }
}
function safeSet(store, key, value) {
  try { store.setItem(key, value) } catch { /* storage unavailable */ }
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function getAnonId() {
  let id = safeGet(localStorage, ANON_KEY)
  if (!id) {
    id = newId()
    safeSet(localStorage, ANON_KEY, id)
  }
  return id
}

function clip(v, n = 100) {
  return typeof v === 'string' && v.length ? v.slice(0, n) : null
}

// Call once at app start. Records the FIRST visit only; later visits never
// overwrite it (first-touch model).
export function captureFirstTouch() {
  try {
    if (safeGet(localStorage, FT_KEY)) return
    const url = new URL(window.location.href)
    const p = url.searchParams
    let refHost = null
    try {
      if (document.referrer) {
        const h = new URL(document.referrer).hostname
        if (!/(^|\.)dohpass\.com$/i.test(h)) refHost = h
      }
    } catch { /* bad referrer */ }
    const ft = {
      utm_source: clip(p.get('utm_source')),
      utm_medium: clip(p.get('utm_medium')),
      utm_campaign: clip(p.get('utm_campaign')),
      utm_content: clip(p.get('utm_content')),
      ref_host: clip(refHost),
      landing_path: clip(url.pathname, 200),
      gclid: p.has('gclid') || null,
      fbclid: p.has('fbclid') || null,
      ts: new Date().toISOString(),
    }
    safeSet(localStorage, FT_KEY, JSON.stringify(ft))
  } catch { /* never break the app for analytics */ }
}

export function getFirstTouch() {
  try {
    const raw = safeGet(localStorage, FT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function track(event, props = {}) {
  try {
    if (!FUNNEL_EVENTS.includes(event)) return
    if (ONCE_PER_SESSION.has(event)) {
      const k = SESSION_PREFIX + event
      if (safeGet(sessionStorage, k)) return
      safeSet(sessionStorage, k, '1')
    }
    supabase
      .rpc('log_funnel_event', {
        p_event: event,
        p_anon_id: getAnonId(),
        p_path: window.location.pathname,
        p_host: window.location.hostname,
        p_props: props || {},
      })
      .then(() => {}, () => {})
  } catch { /* never break the app for analytics */ }
}
