export default function SessionKicked({ onLogin }) {
  return (
    <div className="kicked-overlay">
      <div className="kicked-card">
        <div className="kicked-icon">📱</div>
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
