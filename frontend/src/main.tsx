import './index.css'
// Node Buffer polyfill — some deps in the message-send path expect a global Buffer.
import { Buffer } from 'buffer'
;(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
