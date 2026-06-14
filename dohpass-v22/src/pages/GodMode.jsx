import { useNavigate } from 'react-router-dom'
import { GOD_MODE_TOOLS, toolMonogram } from '../lib/godMode'

/* God Mode hub — admin-only landing that lists every registered admin tool.
   Route guard (AdminRoute) handles access; this page just renders the registry.
   Adding a tool to src/lib/godMode.js makes it appear here with no code change. */
export default function GodMode() {
  const navigate = useNavigate()

  return (
    <div className='gm-root'>
      <Style />

      <header className='gm-header'>
        <button className='gm-back' onClick={() => navigate('/dashboard')}>← Dashboard</button>
        <h1 className='gm-title'>Mission Control</h1>
        <p className='gm-muted'>Admin tools. Visible only to accounts with <code>is_admin</code>.</p>
      </header>

      <div className='gm-grid'>
        {GOD_MODE_TOOLS.map((tool) => {
          const live = tool.status === 'live'
          return (
            <button
              key={tool.key}
              className={`gm-card ${live ? '' : 'is-disabled'}`}
              onClick={() => { if (live) navigate(tool.path) }}
              disabled={!live}
            >
              <div className='gm-card-top'>
                <span className='gm-mono' style={{ background: tool.accent || '#3b82f6' }}>
                  {toolMonogram(tool.title)}
                </span>
                <div className='gm-card-tags'>
                  {tool.tag && <span className='gm-tag'>{tool.tag}</span>}
                  {!live && <span className='gm-tag gm-tag--soon'>{tool.status}</span>}
                </div>
              </div>
              <h2 className='gm-card-title'>{tool.title}</h2>
              <p className='gm-card-desc'>{tool.desc}</p>
              {live && <span className='gm-card-open'>Open →</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Style() {
  return (
    <style>{`
      .gm-root {
        min-height: 100vh;
        background: #0f172a;
        color: #e2e8f0;
        padding: 40px 28px;
        font-family: system-ui, -apple-system, sans-serif;
        box-sizing: border-box;
      }
      .gm-header { max-width: 1100px; margin: 0 auto 28px; }
      .gm-back { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0 0 14px; }
      .gm-back:hover { color: #e2e8f0; }
      .gm-title { margin: 0 0 6px; font-size: 30px; font-weight: 800; }
      .gm-muted { color: #94a3b8; margin: 0; }
      .gm-muted code { background: #1e293b; border: 1px solid #334155; border-radius: 5px; padding: 1px 6px; font-size: 13px; }

      .gm-grid { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }

      .gm-card { text-align: left; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 22px; cursor: pointer; color: #e2e8f0; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s ease, transform .15s ease; }
      .gm-card:hover:not(.is-disabled) { border-color: #2563eb; transform: translateY(-2px); }
      .gm-card.is-disabled { opacity: 0.5; cursor: default; }

      .gm-card-top { display: flex; justify-content: space-between; align-items: center; }
      .gm-mono { width: 44px; height: 44px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; color: #fff; }
      .gm-card-tags { display: flex; gap: 6px; }
      .gm-tag { font-size: 11px; font-weight: 700; color: #cbd5e1; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 3px 8px; letter-spacing: .03em; }
      .gm-tag--soon { color: #fbbf24; text-transform: uppercase; }

      .gm-card-title { margin: 4px 0 0; font-size: 18px; font-weight: 700; }
      .gm-card-desc { margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5; flex: 1; }
      .gm-card-open { color: #60a5fa; font-weight: 700; font-size: 14px; margin-top: 4px; }

      @media (max-width: 600px) {
        .gm-root { padding: 24px 16px; }
        .gm-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  )
}
