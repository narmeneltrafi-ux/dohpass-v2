// Where to send someone after they sign in, sign up or confirm their email,
// so the reason they went to /login survives the detour: the plan they chose
// on /pricing, or the track they were previewing.
//
// Only a short allowlist of same-site paths is accepted. A `next` parameter
// must never become an open redirect, so anything not on the list is dropped.
const ALLOWED = [
  /^\/checkout\?plan=(gp|specialist|all_access)$/,
  /^\/(specialist|gp)$/,
]

const KEY = 'dohpass_next'
// Email confirmation can take a while; a two-day-old intent is still useful,
// anything older is probably not what the person wants any more.
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

export function safeNext(path) {
  if (typeof path !== 'string') return null
  return ALLOWED.some((re) => re.test(path)) ? path : null
}

// "/login?mode=signup&next=%2Fcheckout%3Fplan%3Dgp"
export function authPath({ next, signup = false } = {}) {
  const qs = new URLSearchParams()
  if (signup) qs.set('mode', 'signup')
  const safe = safeNext(next)
  if (safe) qs.set('next', safe)
  const q = qs.toString()
  return q ? `/login?${q}` : '/login'
}

// Kept in localStorage for the email-confirmation round trip: the link in the
// email opens /dashboard, which picks the intent up from here. Same browser
// only — an email opened on another device simply lands on the dashboard.
export function rememberNext(path) {
  const safe = safeNext(path)
  if (!safe) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ p: safe, t: Date.now() }))
  } catch { /* storage unavailable (private mode) — nothing to remember */ }
}

// Returns the remembered path once, then forgets it.
export function takeRememberedNext() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    localStorage.removeItem(KEY)
    const { p, t } = JSON.parse(raw)
    if (typeof t !== 'number' || Date.now() - t > MAX_AGE_MS) return null
    return safeNext(p)
  } catch {
    return null
  }
}
