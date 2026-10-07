import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Muli on the old site, since renamed Mulish. Self-hosted, in every weight.
import '@fontsource-variable/mulish'
import '@fontsource-variable/mulish/wght-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
