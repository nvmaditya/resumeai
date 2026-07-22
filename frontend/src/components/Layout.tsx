import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { setToken } from '../api/client'
import { useTheme } from '../theme'
import { Settings } from '../pages/Settings'

export function Layout() {
  const nav = useNavigate()
  const { theme, toggle, wiping } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get('settings') === '1') {
      setSettingsOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('settings')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!settingsOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  function logout() {
    setToken(null)
    setSettingsOpen(false)
    nav('/login')
  }

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-20 border-b border-[var(--color-line)] backdrop-blur-md"
        style={{ background: 'var(--color-header)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            to="/"
            className="font-display text-lg font-semibold tracking-tight text-[var(--color-accent)]"
          >
            ResumeAI
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[var(--color-soft)]">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? 'text-[var(--color-text)] font-medium'
                  : 'hover:text-[var(--color-text)] transition-colors'
              }
            >
              Resumes
            </NavLink>
            <button
              type="button"
              className={
                settingsOpen
                  ? 'text-[var(--color-text)] font-medium'
                  : 'hover:text-[var(--color-text)] transition-colors'
              }
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
            <button
              type="button"
              className="btn btn-secondary py-1.5 text-xs"
              onClick={toggle}
              disabled={wiping}
              aria-label="Toggle color theme"
              title="Toggle light/dark"
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto h-[calc(100vh-2.75rem)] max-w-[100rem] px-2 py-1.5">
        <Outlet />
      </main>

      {settingsOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close settings backdrop"
            onClick={() => setSettingsOpen(false)}
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--color-line)] bg-[var(--color-panel)] shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <Settings
              embedded
              onClose={() => setSettingsOpen(false)}
              onLogout={logout}
            />
          </aside>
        </>
      )}
    </div>
  )
}
