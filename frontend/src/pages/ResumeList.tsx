import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Resume } from '../api/client'

export function ResumeList() {
  const nav = useNavigate()
  const [items, setItems] = useState<Resume[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setItems(await api<Resume[]>('/resumes'))
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Failed')
      if (String(ex).includes('401') || String(ex).includes('Not authenticated')) {
        nav('/login')
      }
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function create(track: 'latex' | 'structured') {
    setBusy(true)
    try {
      const r = await api<Resume>('/resumes', {
        method: 'POST',
        body: JSON.stringify({
          title: track === 'latex' ? 'LaTeX resume' : 'Structured resume',
          track,
          latex_body:
            track === 'latex'
              ? '\\documentclass{article}\n\\begin{document}\nYour name\n\\end{document}\n'
              : undefined,
        }),
      })
      nav(`/resumes/${r.id}`)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your resumes</h1>
          <p className="mt-1 text-sm text-[var(--color-soft)]">
            Multi-resume workspace · LaTeX or structured tracks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void create('latex')}
            className="btn btn-primary"
          >
            New LaTeX
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create('structured')}
            className="btn btn-secondary"
          >
            New structured
          </button>
        </div>
      </div>

      {err && (
        <p className="mb-4 text-sm text-[var(--color-danger)]" role="alert">
          {err}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <p className="font-display text-lg font-medium">No resumes yet</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--color-soft)]">
            Create a LaTeX or structured resume to score, coach, and iterate.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-6"
            disabled={busy}
            onClick={() => void create('latex')}
          >
            Create your first resume
          </button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                to={`/resumes/${r.id}`}
                className="card group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:border-emerald-800/80"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-slate-100 group-hover:text-white">
                      {r.title}
                    </span>
                    <span className="chip">{r.track}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted)]">
                    {r.id.slice(0, 8)}…
                  </p>
                </div>
                <span className="text-[var(--color-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
