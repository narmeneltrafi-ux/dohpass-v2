// FSRS v5 — Free Spaced Repetition Scheduler
// Based on https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// Default parameters optimised on a large corpus of real review data.

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589,
  1.5330, 0.1544, 1.0070, 1.9395, 0.1100, 0.2900, 2.2700, 0.3200,
  2.9898, 0.5100, 0.4100, 0.8200,
]
const DECAY             = -0.5
const FACTOR            = Math.pow(0.9, 1 / DECAY) - 1  // ≈ 0.2346
const DESIRED_RETENTION = 0.9

export const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 }

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi) }

export function retrievability(elapsedDays, stability) {
  if (!stability || stability <= 0) return 0
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY)
}

// Optimal review interval in days for DESIRED_RETENTION.
// Equals stability because FACTOR is defined from the same retention target.
export function nextInterval(stability) {
  return Math.max(1, Math.round(stability))
}

function initStability(rating)  { return Math.max(W[rating - 1], 0.1) }
function initDifficulty(rating) { return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10) }

function nextDifficulty(d, rating) {
  return clamp(d + (-W[6] * (rating - 3)) * (10 - d) / 9, 1, 10)
}

function nextStabilityRecall(d, s, r, rating) {
  const hard = rating === RATING.HARD ? W[15] : 1
  const easy = rating === RATING.EASY ? W[16] : 1
  return Math.max(
    s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy + 1),
    0.1,
  )
}

function nextStabilityForgot(d, s, r) {
  return Math.max(
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]),
    0.1,
  )
}

// Core scheduling function.
// card = current flashcard_progress row (or null for new cards).
// Returns the fields to upsert into flashcard_progress.
export function scheduleCard(card, rating) {
  const now    = new Date()
  const isNew  = !card || card.stability == null
  let stability, difficulty

  if (isNew) {
    stability  = initStability(rating)
    difficulty = initDifficulty(rating)
  } else {
    const lastReview  = card.last_review ? new Date(card.last_review) : now
    const elapsedDays = Math.max(0, (now - lastReview) / 86400000)
    const r           = retrievability(elapsedDays, card.stability || 1)
    difficulty        = nextDifficulty(card.difficulty || 5, rating)
    stability = rating === RATING.AGAIN
      ? nextStabilityForgot(difficulty, card.stability || 1, r)
      : nextStabilityRecall(difficulty, card.stability || 1, r, rating)
  }

  const interval = nextInterval(stability)
  const dueDate  = new Date(now.getTime() + interval * 86400000)

  return {
    stability,
    difficulty,
    due_date:    dueDate.toISOString(),
    last_review: now.toISOString(),
    reps:        (card?.reps   || 0) + (rating >= RATING.HARD ? 1 : 0),
    lapses:      (card?.lapses || 0) + (rating === RATING.AGAIN ? 1 : 0),
    fsrs_state:  rating === RATING.AGAIN ? (isNew ? 'learning' : 'relearning') : 'review',
    is_known:    rating >= RATING.GOOD,
    marked_at:   now.toISOString(),
  }
}

export function isDue(fsrsRow) {
  if (!fsrsRow) return true  // new card = due immediately
  return new Date(fsrsRow.due_date || 0) <= new Date()
}

export function nextReviewLabel(dueDateIso) {
  if (!dueDateIso) return 'soon'
  const days = Math.round((new Date(dueDateIso) - Date.now()) / 86400000)
  if (days <= 0)  return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7)   return `${days}d`
  if (days < 30)  return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
}

export const RATING_CONFIG = {
  [RATING.AGAIN]: { label: 'Again', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
  [RATING.HARD]:  { label: 'Hard',  color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  [RATING.GOOD]:  { label: 'Good',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)'  },
  [RATING.EASY]:  { label: 'Easy',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)' },
}
