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
    next: Theme
  } | null>(null)
  const wiping = wipe !== null
  const busy = useRef(false)
  const pendingTheme = useRef<Theme | null>(null)

  useEffect(() => {
    apply(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggle = useCallback(() => {
    if (busy.current) return
    const prev = theme
    const next: Theme = theme === 'light' ? 'dark' : 'light'

    if (prefersReducedMotion()) {
      setTheme(next)
      return
    }

    busy.current = true
    pendingTheme.current = next
    // CSS vars under cover (no React tree work yet)
    apply(next)
    localStorage.setItem('theme', next)

    // Full cover first frame, then clip-path only (no setTheme mid-flight)
    setWipe({ bg: INK[prev], out: false, next })
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setWipe((w) => (w ? { ...w, out: true } : null))
      })
    })
    // Safety if animationend is missed
    window.setTimeout(() => {
      if (pendingTheme.current === next) onWipeEnd()
    }, 700)
  }, [theme])

  const onWipeEnd = useCallback(() => {
    if (!busy.current && !pendingTheme.current) return
    const next = pendingTheme.current
    pendingTheme.current = null
    setWipe(null)
    // Sync React after wipe so CodeMirror reconfigure is not mid-animation
    if (next) setTheme(next)
    busy.current = false
  }, [])

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
              if (wipe.out) onWipeEnd()
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
