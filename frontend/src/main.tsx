import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme'
import { ToastProvider } from './toast'

// Apply theme before paint
const saved = localStorage.getItem('theme')
document.documentElement.setAttribute(
  'data-theme',
  saved === 'dark' || saved === 'light' ? saved : 'light',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
