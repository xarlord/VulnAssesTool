import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { initPlatform } from '@/lib/platform'
import './styles/globals.css'
import App from './App'

// Initialize platform adapter before React renders
initPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
