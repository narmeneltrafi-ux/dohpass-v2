// Single source of truth for God Mode (admin-only) tools.
//
// Adding a new admin tool is a three-step, build-once operation:
//   1. Create the tool's page under src/pages/
//   2. Add its route in src/App.jsx wrapped in <AdminRoute> (path under /god-mode/)
//   3. Add one entry to the array below
//
// The hub at /god-mode renders this list automatically, and AppNav surfaces the
// "God Mode" entry to admins — neither needs to change when tools are added.

export const GOD_MODE_TOOLS = [
  {
    key:    'blueprint',
    path:   '/god-mode/blueprint',
    title:  'Blueprint Gap Agent',
    desc:   'Question-bank coverage vs. blueprint targets, with AI gap analysis and a per-topic write plan.',
    tag:    'Content',
    accent: '#3b82f6',
    status: 'live', // 'live' | 'beta' | 'soon'
  },
  {
    key:    'question-writer',
    path:   '/god-mode/question-writer',
    title:  'Question Writer Agent',
    desc:   'Generates DOH-style one-best-answer items to NBME standard, runs an adversarial examiner review, and stages passing items as drafts for approval.',
    tag:    'Content',
    accent: '#8b5cf6',
    status: 'live',
  },
]

// Monogram for a tool card icon — initials of the first two words of the title.
export function toolMonogram(title) {
  if (!title) return '?'
  const words = title.trim().split(/\s+/)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?'
}
