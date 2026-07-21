import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'
import { useTheme } from '../theme'

export function Register() {
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
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      const out = await api<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(out.access_token)
      nav('/')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Register failed')
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
        <div className="card w-full max-w-[420px] p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-[var(--color-soft)]">
            Local-first resume workspace with ATS scoring and AI coach.
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
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="mt-1.5 text-xs text-[var(--color-muted)]">At least 8 characters</p>
            </div>
            {err && (
              <p className="text-sm text-[var(--color-danger)]" role="alert">
                {err}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
          <p className="mt-6 text-sm text-[var(--color-muted)]">
            Already have an account?{' '}
            <Link className="text-[var(--color-accent)] hover:underline" to="/login">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
