import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { setToken } from '../api/client'
import { useTheme } from '../theme'

export function Layout() {
  const nav = useNavigate()
  const { theme, toggle } = useTheme()

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
                isActive ? 'text-[var(--color-text)] font-medium' : 'hover:text-[var(--color-text)] transition-colors'
              }
            >
              Resumes
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive ? 'text-[var(--color-text)] font-medium' : 'hover:text-[var(--color-text)] transition-colors'
              }
            >
              Settings
            </NavLink>
            <button
              type="button"
              className="btn btn-secondary py-1.5 text-xs"
              onClick={toggle}
              aria-label="Toggle color theme"
              title="Toggle light/dark"
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button
              type="button"
              className="hover:text-[var(--color-text)] transition-colors"
              onClick={() => {
                setToken(null)
                nav('/login')
              }}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto h-[calc(100vh-2.75rem)] max-w-[100rem] px-2 py-1.5">
        <Outlet />
      </main>
    </div>
  )
}
