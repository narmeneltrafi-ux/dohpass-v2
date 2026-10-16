import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Order matters: tokens first (index.css aliases its legacy variables onto
// them), then the legacy sheet, then the new site/component layer.
import './styles/tokens.css'
import './index.css'
import './styles/site.css'
import './styles/question.css'
import './styles/dashboard.css'
import { captureFirstTouch } from './lib/attribution'

captureFirstTouch()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
