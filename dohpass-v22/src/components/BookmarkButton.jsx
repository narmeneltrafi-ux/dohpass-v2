export function BookmarkButton({ questionId, topic, bookmarks, toggle }) {
  const isBookmarked = bookmarks.has(String(questionId))
  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(String(questionId), topic) }}
      style={{
        background: isBookmarked ? 'rgba(212,175,55,0.15)' : 'transparent',
        border: `1px solid ${isBookmarked ? '#D4AF37' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: '8px',
        padding: '6px 8px',
        cursor: 'pointer',
        color: isBookmarked ? '#D4AF37' : '#666',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '13px',
      }}
      title={isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}
    >
      {isBookmarked ? '★' : '☆'}
      {isBookmarked ? 'Saved' : 'Save'}
    </button>
  )
}
