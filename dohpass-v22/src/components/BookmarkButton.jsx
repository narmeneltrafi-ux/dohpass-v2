const IconBookmark = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)
const IconBookmarkFilled = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
)

export function BookmarkButton({ questionId, topic, bookmarks, toggle }) {
  const saved = bookmarks.has(String(questionId))
  return (
    <button
      type="button"
      className={`bm-btn${saved ? ' bm-btn--saved' : ''}`}
      onClick={(e) => { e.stopPropagation(); toggle(String(questionId), topic) }}
      title={saved ? 'Remove bookmark' : 'Bookmark this question'}
      aria-pressed={saved}
    >
      {saved ? <IconBookmarkFilled /> : <IconBookmark />}
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}
