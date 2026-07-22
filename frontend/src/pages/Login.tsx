import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { useTheme } from '../theme'

export function Login() {
  const nav = useNavigate()
  const { theme, toggle } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const out = await api<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(out.access_token)
      nav('/')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-6 py-5">
        <span className="font-display text-lg font-semibold text-[var(--color-accent)]">ResumeAI</span>
        <button type="button" className="btn btn-secondary text-xs py-1.5" onClick={toggle}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:pt-12">
        <div className="card w-full max-w-[420px] p-8 shadow-[var(--shadow)]">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
            Local workspace
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--color-soft)]">
            Score, coach, and ship a stronger engineering resume.
          </p>
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && (
              <p className="text-sm text-[var(--color-danger)]" role="alert">
                {err}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
              {busy ? 'Signing in…' : 'Continue'}
            </button>
          </form>
          <p className="mt-6 text-sm text-[var(--color-muted)]">
            No account?{' '}
            <Link className="text-[var(--color-accent)] hover:underline" to="/register">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
