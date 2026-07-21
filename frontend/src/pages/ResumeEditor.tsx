import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, downloadFile, fetchPdfObjectUrl, type Job, type Resume } from '../api/client'
import { ProgressStepper } from '../components/ProgressStepper'
import {
  StructuredForm,
  fromApi,
  toApi,
  type StructuredResume,
} from '../components/StructuredForm'
import { useToast } from '../toast'

const COACH_ACTIONS = [
  { id: 'improve_score', label: 'Improve score' },
  { id: 'strengthen_projects', label: 'Strengthen projects' },
  { id: 'align_jd', label: 'Align to JD' },
  { id: 'quantify_impact', label: 'Quantify impact' },
] as const

export function ResumeEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [resume, setResume] = useState<Resume | null>(null)
  const [title, setTitle] = useState('')
  const [latex, setLatex] = useState('')
  const [structured, setStructured] = useState<StructuredResume>(fromApi(null))
  const [jd, setJd] = useState('')
  const [chatReply, setChatReply] = useState('')
  const [proposed, setProposed] = useState<{
    section: string
    before: string
    after: string
  } | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState('')
  const [scoring, setScoring] = useState(false)
  const [coaching, setCoaching] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [hasPdf, setHasPdf] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  const compilingRef = useRef(false)

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  useEffect(() => () => revokePreview(), [revokePreview])

  async function load() {
    const r = await api<Resume>(`/resumes/${id}`)
    setResume(r)
    setTitle(r.title)
    setLatex(r.latex_body || '')
    setStructured(fromApi(r.structured_json as Record<string, unknown>))
    setDirty(false)
  }

  useEffect(() => {
    void load()
    revokePreview()
    setShowPreview(false)
    setHasPdf(false)
  }, [id])

  async function save() {
    const body =
      resume?.track === 'latex'
        ? { title, latex_body: latex }
        : { title, structured_json: toApi(structured) }
    const r = await api<Resume>(`/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    setResume(r)
    setTitle(r.title)
    setDirty(false)
    setStatus('Saved')
    toast.push('Saved')
    return r
  }

  const loadPreviewBlob = useCallback(async () => {
    const url = await fetchPdfObjectUrl(`/resumes/${id}/pdf?inline=1`)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setHasPdf(true)
  }, [id])

  const compileAndPreview = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (compilingRef.current) return
      compilingRef.current = true
      setPreviewBusy(true)
      try {
        if (dirty) {
          const body =
            resume?.track === 'latex'
              ? { title, latex_body: latex }
              : { title, structured_json: toApi(structured) }
          const r = await api<Resume>(`/resumes/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
          setResume(r)
          setDirty(false)
        }
        const out = await api<{ message: string; pdf_key?: string; bytes?: number }>(
          `/resumes/${id}/compile`,
          { method: 'POST' },
        )
        setShowPreview(true)
        await loadPreviewBlob()
        setStatus(
          `Preview updated${out.bytes ? ` · ${out.bytes} bytes` : ''} · letter layout with 0.75″ margins`,
        )
        if (!opts?.quiet) toast.push('Preview ready')
      } catch (ex) {
        setStatus(ex instanceof Error ? ex.message : 'Compile failed')
        if (!opts?.quiet) toast.push(ex instanceof Error ? ex.message : 'Compile failed')
      } finally {
        setPreviewBusy(false)
        compilingRef.current = false
      }
    },
    [dirty, id, latex, loadPreviewBlob, resume?.track, structured, title, toast],
  )

  // Live preview: recompile when content changes while preview is open
  useEffect(() => {
    if (!showPreview || !resume) return
    const t = window.setTimeout(() => {
      void compileAndPreview({ quiet: true })
    }, 900)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce on content
  }, [latex, structured, title, showPreview])

  async function downloadPdf() {
    try {
      if (!hasPdf) await compileAndPreview({ quiet: true })
      await downloadFile(`/resumes/${id}/pdf`, `${(title || 'resume').replace(/\s+/g, '_')}.pdf`)
      toast.push('Download started')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Download failed — compile first')
    }
  }

  async function score() {
    if (dirty) await save()
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
          toast.push(
            cur.status === 'complete'
              ? `Score: ${cur.result_json?.overall_score ?? '—'}`
              : 'Score failed',
          )
          break
        }
      }
    } finally {
      setScoring(false)
    }
  }

  async function runCoach(action: (typeof COACH_ACTIONS)[number]['id']) {
    setCoaching(true)
    try {
      const out = await api<{ reply: string; proposed_edit: typeof proposed }>(
        `/resumes/${id}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            job_description: jd.slice(0, 4000) || null,
          }),
        },
      )
      setChatReply(out.reply)
      setProposed(out.proposed_edit)
      toast.push('Coach reply ready')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Coach failed')
    } finally {
      setCoaching(false)
    }
  }

  async function applyEdit() {
    if (!proposed) return
    const r = await api<Resume>(`/resumes/${id}/apply-edit`, {
      method: 'POST',
      body: JSON.stringify({ section: proposed.section, after: proposed.after }),
    })
    setResume(r)
    if (r.track === 'latex') setLatex(r.latex_body || proposed.after)
    else setStructured(fromApi(r.structured_json as Record<string, unknown>))
    setProposed(null)
    setDirty(false)
    setStatus('Edit applied — re-score manually when ready')
    toast.push('Edit applied')
    if (showPreview) void compileAndPreview({ quiet: true })
  }

  async function remove() {
    if (!resume || !confirm(`Delete “${resume.title}”?`)) return
    await api(`/resumes/${id}`, { method: 'DELETE' })
    toast.push('Deleted')
    nav('/')
  }

  function copyScore() {
    const n = job?.result_json?.overall_score
    if (n == null) return
    void navigator.clipboard.writeText(String(n))
    toast.push('Score copied')
  }

  if (!resume) {
    return <p className="text-sm text-[var(--color-soft)]">Loading workspace…</p>
  }

  const cats = job?.result_json?.categories || []
  const overall = job?.result_json?.overall_score

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link to="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
            ← Resumes
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="input max-w-md font-display text-xl font-semibold tracking-tight sm:text-2xl py-1.5"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
              aria-label="Resume title"
            />
            <span className="chip">{resume.track}</span>
            {dirty && <span className="text-xs text-[var(--color-warn)]">Unsaved</span>}
          </div>
          <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{resume.id.slice(0, 13)}…</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save()} className="btn btn-secondary">
            Save
          </button>
          <button
            type="button"
            onClick={() => void compileAndPreview()}
            className="btn btn-secondary"
            disabled={previewBusy}
          >
            {previewBusy ? 'Compiling…' : 'Compile & preview'}
          </button>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            className="btn btn-secondary"
            title="Download last compile"
          >
            Download PDF
          </button>
          <button type="button" onClick={() => void score()} className="btn btn-primary" disabled={scoring}>
            {scoring ? 'Scoring…' : 'Re-check score'}
          </button>
          <button type="button" onClick={() => void remove()} className="btn btn-danger">
            Delete
          </button>
        </div>
      </div>

      {status && (
        <p className="text-sm text-[var(--color-soft)]" role="status">
          {status}
        </p>
      )}

      {/* Main workspace + optional PDF preview rail */}
      <div className={`grid gap-5 ${showPreview ? 'xl:grid-cols-12' : ''}`}>
        <div className={`space-y-5 ${showPreview ? 'xl:col-span-7' : ''}`}>
          <div className="grid gap-5 lg:grid-cols-12">
            <section className="card flex flex-col p-4 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold tracking-wide">
                  {resume.track === 'latex' ? 'LaTeX editor' : 'Structured form'}
                </h2>
              </div>
              {resume.track === 'latex' ? (
                <textarea
                  className="input min-h-[28rem] flex-1 resize-y font-mono text-[13px] leading-relaxed"
                  value={latex}
                  onChange={(e) => {
                    setLatex(e.target.value)
                    setDirty(true)
                  }}
                  spellCheck={false}
                />
              ) : (
                <StructuredForm
                  value={structured}
                  onChange={(v) => {
                    setStructured(v)
                    setDirty(true)
                  }}
                />
              )}
            </section>

            <div className="flex flex-col gap-5 lg:col-span-5">
              <section className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-semibold tracking-wide">ATS score</h2>
                  {overall != null && job?.status === 'complete' && (
                    <button type="button" className="btn btn-secondary text-xs py-1" onClick={copyScore}>
                      Copy
                    </button>
                  )}
                </div>
                {job ? (
                  <div className="mt-3 space-y-4">
                    <ProgressStepper status={job.status} />
                    {job.status === 'processing' || job.status === 'queued' ? (
                      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-4 py-6 text-center">
                        <p className="font-display text-3xl font-semibold text-[var(--color-muted)]">…</p>
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
                                <span className="font-medium">{c.name}</span>
                                <span className="tabular-nums text-[var(--color-soft)]">{c.score}</span>
                              </div>
                              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-line)]">
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
                    {job.error && <p className="text-sm text-[var(--color-danger)]">{job.error}</p>}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[var(--color-muted)]">
                    Run <strong>Re-check score</strong> for async results with evidence.
                  </p>
                )}
              </section>

              <section className="card p-4">
                <h2 className="font-display text-sm font-semibold tracking-wide">JD-aware coach</h2>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Fixed actions only — free-form chat is disabled to reduce prompt injection risk.
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="label" htmlFor="jd">
                      Job description (optional, max 4k)
                    </label>
                    <textarea
                      id="jd"
                      className="input h-24 resize-y text-sm"
                      placeholder="Paste JD for align-to-JD action"
                      maxLength={4000}
                      value={jd}
                      onChange={(e) => setJd(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-[var(--color-muted)]">{jd.length}/4000</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {COACH_ACTIONS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="btn btn-primary text-xs"
                        disabled={coaching}
                        onClick={() => void runCoach(a.id)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  {chatReply && (
                    <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 text-sm leading-relaxed">
                      {chatReply}
                    </p>
                  )}
                  {proposed && (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
                      <p className="text-sm font-medium text-amber-700">
                        Proposed edit · <span className="font-mono text-xs">{proposed.section}</span>
                      </p>
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--color-soft)]">
                        {proposed.after}
                      </pre>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void applyEdit()} className="btn btn-warn">
                          Approve & apply
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setProposed(null)}>
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

        {showPreview && (
          <aside className="card flex flex-col overflow-hidden xl:col-span-5 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)]">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
              <div>
                <h2 className="font-display text-sm font-semibold">PDF preview</h2>
                <p className="text-xs text-[var(--color-muted)]">
                  Live · letter · 0.75″ margins
                  {previewBusy ? ' · updating…' : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary text-xs py-1"
                onClick={() => {
                  setShowPreview(false)
                  revokePreview()
                }}
              >
                Close
              </button>
            </div>
            <div className="min-h-[28rem] flex-1 bg-[var(--color-panel-2)] p-3">
              {previewUrl ? (
                <iframe
                  title="Resume PDF preview"
                  src={previewUrl}
                  className="h-full min-h-[28rem] w-full rounded-lg border border-[var(--color-line)] bg-white"
                />
              ) : (
                <div className="flex h-full min-h-[28rem] items-center justify-center text-sm text-[var(--color-muted)]">
                  {previewBusy ? 'Rendering…' : 'No preview yet'}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
