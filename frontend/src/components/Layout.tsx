import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { setToken } from '../api/client'

export function Layout() {
  const nav = useNavigate()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[rgba(11,15,20,0.85)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight text-[var(--color-accent)]">
            ResumeAI
          </Link>
          <nav className="flex items-center gap-5 text-sm text-[var(--color-soft)]">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'text-white' : 'hover:text-white transition-colors'
              }
            >
              Resumes
            </NavLink>
            <button
              type="button"
              className="hover:text-white transition-colors"
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
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
