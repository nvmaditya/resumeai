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
  const [proposed, setProposed] = useState<{
    section: string
    before: string
    after: string
  } | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState('')
  const [scoring, setScoring] = useState(false)

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
    setScoring(true)
    setStatus('Scoring…')
    try {
      const j = await api<Job>(`/resumes/${id}/score`, { method: 'POST' })
      setJob(j)
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 150))
        const cur = await api<Job>(`/jobs/${j.id}`)
        setJob(cur)
        if (cur.status === 'complete' || cur.status === 'failed') {
          setStatus(cur.status)
          break
        }
      }
    } finally {
      setScoring(false)
    }
  }

  async function chat() {
    const out = await api<{ reply: string; proposed_edit: typeof proposed }>(
      `/resumes/${id}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ message, job_description: jd || null }),
      },
    )
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

  if (!resume) {
    return <p className="text-sm text-[var(--color-soft)]">Loading workspace…</p>
  }

  const cats = job?.result_json?.categories || []
  const overall = job?.result_json?.overall_score

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/"
            className="text-sm text-[var(--color-muted)] transition-colors hover:text-white"
          >
            ← Resumes
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {resume.title}
            </h1>
            <span className="chip">{resume.track}</span>
          </div>
          <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
            {resume.id.slice(0, 13)}…
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} className="btn btn-secondary">
            Save
          </button>
          <button type="button" onClick={() => void compile()} className="btn btn-secondary">
            Compile
          </button>
          <button
            type="button"
            onClick={() => void score()}
            className="btn btn-primary"
            disabled={scoring}
          >
            {scoring ? 'Scoring…' : 'Re-check score'}
          </button>
        </div>
      </div>

      {status && (
        <p className="text-sm text-[var(--color-soft)]" role="status">
          {status}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Editor ~58% */}
        <section className="card flex flex-col p-4 lg:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold tracking-wide text-slate-200">
              {resume.track === 'latex' ? 'LaTeX editor' : 'Structured JSON'}
            </h2>
            <span className="text-xs text-[var(--color-muted)]">JetBrains Mono</span>
          </div>
          {resume.track === 'latex' ? (
            <textarea
              className="input min-h-[28rem] flex-1 resize-y font-mono text-[13px] leading-relaxed"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <textarea
              className="input min-h-[28rem] flex-1 resize-y font-mono text-[13px] leading-relaxed"
              value={structuredText}
              onChange={(e) => setStructuredText(e.target.value)}
              spellCheck={false}
            />
          )}
        </section>

        {/* Score + coach ~42% */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          <section className="card p-4">
            <h2 className="font-display text-sm font-semibold tracking-wide text-slate-200">
              ATS score
            </h2>
            {job ? (
              <div className="mt-3 space-y-4">
                <ProgressStepper status={job.status} />
                {job.status === 'processing' || job.status === 'queued' ? (
                  <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-4 py-6 text-center">
                    <p className="font-display text-3xl font-semibold text-[var(--color-muted)]">
                      …
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-soft)]">Scoring in progress</p>
                  </div>
                ) : job.result_json ? (
                  <>
                    <div className="flex items-end gap-2">
                      <span className="font-display text-5xl font-semibold tabular-nums text-[var(--color-accent)]">
                        {overall ?? '—'}
                      </span>
                      <span className="mb-2 text-sm text-[var(--color-muted)]">/100</span>
                    </div>
                    <ul className="space-y-2">
                      {cats.map((c) => (
                        <li
                          key={c.name}
                          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3"
                        >
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium text-slate-200">{c.name}</span>
                            <span className="tabular-nums text-[var(--color-soft)]">{c.score}</span>
                          </div>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-[var(--color-accent)]"
                              style={{ width: `${Math.min(100, Math.max(0, c.score))}%` }}
                            />
                          </div>
                          {c.evidence && (
                            <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                              {c.evidence}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {job.error && (
                  <p className="text-sm text-[var(--color-danger)]">{job.error}</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                Run <strong className="text-slate-300">Re-check score</strong> for async results
                with evidence.
              </p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="font-display text-sm font-semibold tracking-wide text-slate-200">
              JD-aware coach
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="label" htmlFor="jd">
                  Job description
                </label>
                <textarea
                  id="jd"
                  className="input h-24 resize-y text-sm"
                  placeholder="Paste JD (optional)"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="msg">
                  Message
                </label>
                <input
                  id="msg"
                  className="input text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <button type="button" onClick={() => void chat()} className="btn btn-primary">
                Ask
              </button>
              {chatReply && (
                <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 text-sm leading-relaxed text-slate-300">
                  {chatReply}
                </p>
              )}
              {proposed && (
                <div className="rounded-xl border border-amber-700/60 bg-[rgba(245,158,11,0.06)] p-3 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]">
                  <p className="text-sm font-medium text-amber-300">
                    Proposed edit · <span className="font-mono text-xs">{proposed.section}</span>
                  </p>
                  <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--color-soft)]">
                    {proposed.after}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void applyEdit()} className="btn btn-warn">
                      Approve & apply
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setProposed(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
