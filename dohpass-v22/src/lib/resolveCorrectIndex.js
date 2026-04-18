// Single source of truth for mapping a question's `answer` column to an index
// into its `options` array. Used by the scoring path and the UI highlight
// path; they MUST return the same value for every (options, answer) pair.
export function resolveCorrectIndex(options, answer) {
  if (!Array.isArray(options) || options.length === 0) return -1
  if (answer == null) return -1

  // (a) Normalize: trim, uppercase, strip trailing punctuation/whitespace.
  const normalized = String(answer).trim().toUpperCase().replace(/[^A-Z0-9]+$/, '')
  if (!normalized) return -1

  // (b) Canonical: single letter A–E maps directly to an index.
  if (normalized.length === 1 && normalized >= 'A' && normalized <= 'E') {
    const idx = normalized.charCodeAt(0) - 'A'.charCodeAt(0)
    if (idx >= 0 && idx < options.length) return idx
  }

  // (c) Legacy: options carry "A."/"B."/... prefixes.
  const prefixIdx = options.findIndex(opt =>
    typeof opt === 'string' &&
    opt.trim().toUpperCase().startsWith(normalized + '.')
  )
  if (prefixIdx !== -1) return prefixIdx

  // (d) Unresolvable.
  return -1
}
