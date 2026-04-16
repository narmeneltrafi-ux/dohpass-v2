import { supabase } from './supabase'

/**
 * Single-Device Session Enforcement
 *
 * Uses a `device_sessions` table in Supabase to track active sessions.
 * Each login writes a unique session token. A polling interval checks
 * if the current token is still the active one — if not, the user gets
 * logged out (another device took over).
 *
 * Table schema (run via Supabase SQL editor):
 *
 *   CREATE TABLE IF NOT EXISTS device_sessions (
 *     user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 *     session_token TEXT NOT NULL,
 *     device_info   TEXT,
 *     created_at    TIMESTAMPTZ DEFAULT now(),
 *     updated_at    TIMESTAMPTZ DEFAULT now()
 *   );
 *
 *   ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;
 *
 *   CREATE POLICY "Users can read own session"
 *     ON device_sessions FOR SELECT
 *     USING (auth.uid() = user_id);
 *
 *   CREATE POLICY "Users can upsert own session"
 *     ON device_sessions FOR INSERT
 *     WITH CHECK (auth.uid() = user_id);
 *
 *   CREATE POLICY "Users can update own session"
 *     ON device_sessions FOR UPDATE
 *     USING (auth.uid() = user_id);
 */

// Generate a unique session token for this browser tab
function generateSessionToken() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

// Get a human-readable device descriptor
function getDeviceInfo() {
  const ua = navigator.userAgent
  let device = 'Unknown'
  if (/iPhone|iPad|iPod/.test(ua)) device = 'iOS'
  else if (/Android/.test(ua)) device = 'Android'
  else if (/Mac/.test(ua)) device = 'Mac'
  else if (/Win/.test(ua)) device = 'Windows'
  else if (/Linux/.test(ua)) device = 'Linux'

  let browser = 'Browser'
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome'
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'
  else if (/Firefox/.test(ua)) browser = 'Firefox'
  else if (/Edg/.test(ua)) browser = 'Edge'

  return `${browser} on ${device}`
}

// Module-level state
let currentToken = null
let pollInterval = null

/**
 * Register this device as the active session for the user.
 * Overwrites any previous session — that device will be forced out.
 */
export async function registerDeviceSession(userId) {
  currentToken = generateSessionToken()
  const deviceInfo = getDeviceInfo()

  const { error } = await supabase.from('device_sessions').upsert({
    user_id: userId,
    session_token: currentToken,
    device_info: deviceInfo,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) {
    console.error('registerDeviceSession error:', error.message)
    // Don't block login if table doesn't exist yet
    return
  }
}

/**
 * Start polling to verify this is still the active session.
 * If another device takes over, calls `onKicked()`.
 *
 * @param {string} userId
 * @param {Function} onKicked — called when this session is no longer active
 * @param {number} intervalMs — polling interval (default 10s)
 */
export function startSessionPolling(userId, onKicked, intervalMs = 10000) {
  stopSessionPolling()

  pollInterval = setInterval(async () => {
    if (!currentToken) return

    try {
      const { data, error } = await supabase
        .from('device_sessions')
        .select('session_token')
        .eq('user_id', userId)
        .single()

      if (error) {
        // Table might not exist yet — don't kick the user
        console.warn('Session poll error:', error.message)
        return
      }

      if (data && data.session_token !== currentToken) {
        // Another device has logged in — this session is invalid
        stopSessionPolling()
        onKicked()
      }
    } catch (err) {
      console.warn('Session poll exception:', err)
    }
  }, intervalMs)
}

/**
 * Stop the session polling interval.
 */
export function stopSessionPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

/**
 * Clear the device session for the user (on logout).
 */
export async function clearDeviceSession(userId) {
  stopSessionPolling()
  currentToken = null

  if (!userId) return
  await supabase
    .from('device_sessions')
    .delete()
    .eq('user_id', userId)
    .catch(() => {})  // Ignore errors on cleanup
}
