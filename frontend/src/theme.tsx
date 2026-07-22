import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type Theme = 'light' | 'dark'

const ThemeCtx = createContext<{
  theme: Theme
  toggle: () => void
  wiping: boolean
} | null>(null)

const INK: Record<Theme, string> = {
  light: '#f4f6f8',
  dark: '#0b0f14',
}

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    return saved === 'dark' || saved === 'light' ? saved : 'light'
  })
  const [wipe, setWipe] = useState<{
    bg: string
    out: boolean
  } | null>(null)
  const wiping = wipe !== null
  const busy = useRef(false)
  const safetyTimer = useRef<number | null>(null)

  useEffect(() => {
    apply(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const finishWipe = useCallback(() => {
    if (safetyTimer.current != null) {
      window.clearTimeout(safetyTimer.current)
      safetyTimer.current = null
    }
    setWipe(null)
    busy.current = false
  }, [])

  const toggle = useCallback(() => {
    if (busy.current) return
    const prev = theme
    const next: Theme = theme === 'light' ? 'dark' : 'light'

    // Instant: button label + data-theme (via useEffect)
    setTheme(next)

    if (prefersReducedMotion()) {
      return
    }

    busy.current = true
    setWipe({ bg: INK[prev], out: false })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setWipe((w) => (w ? { ...w, out: true } : null))
      })
    })
    safetyTimer.current = window.setTimeout(finishWipe, 700)
  }, [theme, finishWipe])

  const value = useMemo(() => ({ theme, toggle, wiping }), [theme, toggle, wiping])

  return (
    <ThemeCtx.Provider value={value}>
      {children}
      {wipe &&
        createPortal(
          <div
            className={`theme-wipe${wipe.out ? ' theme-wipe-out' : ''}`}
            style={{ ['--wipe-bg' as string]: wipe.bg }}
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return
              if (!String(e.animationName).includes('theme-wipe')) return
              if (wipe.out) finishWipe()
            }}
            aria-hidden
          />,
          document.body,
        )}
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme outside provider')
  return ctx
}
