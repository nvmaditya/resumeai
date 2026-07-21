import { Link, Outlet, useNavigate } from 'react-router-dom'
import { setToken } from '../api/client'

export function Layout() {
  const nav = useNavigate()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-semibold tracking-tight text-emerald-400">
          ResumeAI
        </Link>
        <nav className="flex gap-4 text-sm text-slate-300">
          <Link to="/" className="hover:text-white">
            Resumes
          </Link>
          <button
            className="hover:text-white"
            onClick={() => {
              setToken(null)
              nav('/login')
            }}
          >
            Log out
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  )
}
