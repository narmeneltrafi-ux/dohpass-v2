// Save/unsave toggle shown in the question metadata row. Styling lives in
// styles/question.css (.bm-btn) so it follows the question screen's light
// and dark themes; aria-pressed exposes the toggle state to assistive tech.
export function BookmarkButton({ questionId, topic, bookmarks, toggle }) {
  const isBookmarked = bookmarks.has(String(questionId))
  return (
    <button
      type="button"
      className="bm-btn"
      aria-pressed={isBookmarked}
      onClick={(e) => { e.stopPropagation(); toggle(String(questionId), topic) }}
      title={isBookmarked ? 'Remove from saved questions' : 'Save this question'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {isBookmarked ? 'Saved' : 'Save'}
    </button>
  )
}
