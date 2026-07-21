import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Resume } from '../api/client'

export function ResumeList() {
  const nav = useNavigate()
  const [items, setItems] = useState<Resume[]>([])
  const [err, setErr] = useState('')

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
    const r = await api<Resume>('/resumes', {
      method: 'POST',
      body: JSON.stringify({
        title: track === 'latex' ? 'LaTeX resume' : 'Structured resume',
        track,
        latex_body: track === 'latex' ? '\\documentclass{article}\n\\begin{document}\nYour name\n\\end{document}\n' : undefined,
      }),
    })
    nav(`/resumes/${r.id}`)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your resumes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => void create('latex')}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500"
          >
            New LaTeX
          </button>
          <button
            onClick={() => void create('structured')}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
          >
            New structured
          </button>
        </div>
      </div>
      {err && <p className="mb-4 text-red-400">{err}</p>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              to={`/resumes/${r.id}`}
              className="block rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-emerald-700"
            >
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-slate-400">{r.track}</div>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <p className="text-slate-400">No resumes yet. Create one to start the loop.</p>
        )}
      </ul>
    </div>
  )
}
