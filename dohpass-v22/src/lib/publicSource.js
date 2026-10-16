// The `source` column mixes two different things:
//   1. guideline references a learner should see (NICE NG51, ESC 2023, BAD …)
//   2. internal provenance labels that must never reach the UI
//      ("manual", pipeline names, third-party bank names, recall batches).
// Until the column is split in the database, the UI shows a source only when
// it is not an internal label. Unknown values default to visible because
// almost every other value in the bank is a guideline name.
const INTERNAL = /\b(manual|claude|opus|blueprint|passmedicine|radar|recall|pastest|onexamination|ai[- ]generated|draft)\b/i

export function publicSource(source) {
  const s = typeof source === 'string' ? source.trim() : ''
  if (!s) return null
  if (INTERNAL.test(s)) return null
  return s
}
