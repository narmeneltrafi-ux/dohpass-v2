import { supabase } from './supabase'

/**
 * Single-Device Session Enforcement
 *
 * Uses a `device_sessions` table in Supabase to track active sessions.
 * Each login writes a unique session token. A polling interval checks
 * if the current token is still the active one — if not, the user gets
 * logged out (another device took over).
 */

function generateSessionToken() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

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

let currentToken = null
let pollInterval = null

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
  }
}

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
        console.warn('Session poll error:', error.message)
        return
      }

      if (data && data.session_token !== currentToken) {
        stopSessionPolling()
        onKicked()
      }
    } catch (err) {
      console.warn('Session poll exception:', err)
    }
  }, intervalMs)
}

export function stopSessionPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

export async function clearDeviceSession(userId) {
  stopSessionPolling()
  currentToken = null

  if (!userId) return
  await supabase
    .from('device_sessions')
    .delete()
    .eq('user_id', userId)
    .catch(() => {})
}
