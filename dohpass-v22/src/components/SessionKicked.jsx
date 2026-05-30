export default function SessionKicked({ onLogin }) {
  return (
    <div className="kicked-overlay">
      <div className="kicked-card">
        <div className="kicked-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
        <h2 className="kicked-title">Signed in on another device</h2>
        <p className="kicked-body">
          Your account was accessed from a different device or browser.
          DOHPass allows only one active session at a time.
        </p>
        <button className="kicked-btn" onClick={onLogin}>
          Sign In Again
        </button>
      </div>
    </div>
  )
}
