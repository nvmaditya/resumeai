import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setToken } from '../api/client'

export function Register() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr('')
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
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8">
      <h1 className="mb-6 text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"
          placeholder="Password (min 8)"
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="w-full rounded-lg bg-emerald-600 py-2 font-medium hover:bg-emerald-500">
          Register
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-400">
        Have an account? <Link className="text-emerald-400" to="/login">Log in</Link>
      </p>
    </div>
  )
}
