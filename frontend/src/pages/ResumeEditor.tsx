import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Job, type Resume } from '../api/client'
import { ProgressStepper } from '../components/ProgressStepper'

export function ResumeEditor() {
  const { id } = useParams()
  const [resume, setResume] = useState<Resume | null>(null)
  const [latex, setLatex] = useState('')
  const [structuredText, setStructuredText] = useState('{}')
  const [jd, setJd] = useState('')
  const [message, setMessage] = useState('How can I improve my score?')
  const [chatReply, setChatReply] = useState('')
  const [proposed, setProposed] = useState<{ section: string; before: string; after: string } | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState('')

  async function load() {
    const r = await api<Resume>(`/resumes/${id}`)
    setResume(r)
    setLatex(r.latex_body || '')
    setStructuredText(JSON.stringify(r.structured_json || {}, null, 2))
  }

  useEffect(() => {
    void load()
  }, [id])

  async function save() {
    const body =
      resume?.track === 'latex'
        ? { latex_body: latex }
        : { structured_json: JSON.parse(structuredText) }
    const r = await api<Resume>(`/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    setResume(r)
    setStatus('Saved')
  }

  async function compile() {
    const out = await api<{ message: string; pdf_key?: string }>(`/resumes/${id}/compile`, {
      method: 'POST',
    })
    setStatus(out.message + (out.pdf_key ? ` · ${out.pdf_key}` : ''))
  }

  async function score() {
    const j = await api<Job>(`/resumes/${id}/score`, { method: 'POST' })
    setJob(j)
    setStatus('Scoring…')
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150))
      const cur = await api<Job>(`/jobs/${j.id}`)
      setJob(cur)
      if (cur.status === 'complete' || cur.status === 'failed') {
        setStatus(cur.status)
        break
      }
    }
  }

  async function chat() {
    const out = await api<{ reply: string; proposed_edit: typeof proposed }>(`/resumes/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, job_description: jd || null }),
    })
    setChatReply(out.reply)
    setProposed(out.proposed_edit)
  }

  async function applyEdit() {
    if (!proposed) return
    const r = await api<Resume>(`/resumes/${id}/apply-edit`, {
      method: 'POST',
      body: JSON.stringify({ section: proposed.section, after: proposed.after }),
    })
    setResume(r)
    setLatex(r.latex_body || proposed.after)
    setProposed(null)
    setStatus('Edit applied — re-score manually when ready')
  }

  if (!resume) return <p className="text-slate-400">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-slate-400 hover:text-white">
            ← Resumes
          </Link>
          <h1 className="text-2xl font-semibold">{resume.title}</h1>
          <p className="text-xs text-slate-400">{resume.track} · {resume.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void save()} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">
            Save
          </button>
          <button onClick={() => void compile()} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">
            Compile
          </button>
          <button onClick={() => void score()} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm">
            Re-check score
          </button>
        </div>
      </div>

      {status && <p className="text-sm text-slate-300">{status}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 font-medium">Editor</h2>
          {resume.track === 'latex' ? (
            <textarea
              className="h-80 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
            />
          ) : (
            <textarea
              className="h-80 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm"
              value={structuredText}
              onChange={(e) => setStructuredText(e.target.value)}
            />
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 font-medium">Score</h2>
            {job ? (
              <>
                <ProgressStepper status={job.status} />
                {job.result_json && (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-lg font-semibold text-emerald-400">
                      Overall: {job.result_json.overall_score}
                    </p>
                    <ul className="space-y-2">
                      {(job.result_json.categories || []).map((c) => (
                        <li key={c.name} className="rounded-lg bg-slate-950 p-2">
                          <div className="flex justify-between">
                            <span>{c.name}</span>
                            <span>{c.score}</span>
                          </div>
                          <p className="text-xs text-slate-400">{c.evidence}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {job.error && <p className="mt-2 text-red-400">{job.error}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-400">Run “Re-check score” for async job + results.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 font-medium">JD coach</h2>
            <textarea
              className="mb-2 h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"
              placeholder="Paste job description (optional)"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
            <input
              className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button onClick={() => void chat()} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm">
              Ask
            </button>
            {chatReply && <p className="mt-3 text-sm text-slate-300">{chatReply}</p>}
            {proposed && (
              <div className="mt-3 rounded-lg border border-amber-700/50 bg-slate-950 p-3 text-sm">
                <p className="mb-1 font-medium text-amber-300">Proposed edit ({proposed.section})</p>
                <pre className="mb-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-slate-400">
                  {proposed.after}
                </pre>
                <button
                  onClick={() => void applyEdit()}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm hover:bg-amber-500"
                >
                  Approve & apply
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
