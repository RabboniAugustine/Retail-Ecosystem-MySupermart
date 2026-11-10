import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, getTheme } from './lib/theme'

// Apply the saved theme before the first paint.
applyTheme(getTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
