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
  const [showPreview, setShowPreview] = useState(true)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [engine, setEngine] = useState<string>('')
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
    setHasPdf(false)
    setShowPreview(true)
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
        const out = await api<{
          message: string
          pdf_key?: string
          bytes?: number
          engine?: string
        }>(`/resumes/${id}/compile`, { method: 'POST' })
        setShowPreview(true)
        setEngine(out.engine || '')
        await loadPreviewBlob()
        setStatus(
          `${out.message}${out.bytes ? ` · ${out.bytes} B` : ''}${out.engine ? ` · ${out.engine}` : ''}`,
        )
        if (!opts?.quiet) toast.push(out.engine === 'tectonic' ? 'TeX preview ready' : 'Preview ready')
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

  useEffect(() => {
    if (!showPreview || !resume) return
    const t = window.setTimeout(() => {
      void compileAndPreview({ quiet: true })
    }, 900)
    return () => window.clearTimeout(t)
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
    <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-3">
      {/* Thin header */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← Resumes
        </Link>
        <input
          className="input max-w-sm font-display text-lg font-semibold py-1.5"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
          aria-label="Resume title"
        />
        <span className="chip">{resume.track}</span>
        {dirty && <span className="text-xs text-[var(--color-warn)]">Unsaved</span>}
        {engine && <span className="chip">{engine}</span>}
      </div>

      {/* 1/5 options | 2/5 editor | 2/5 preview */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-5">
        {/* OPTIONS 1/5 */}
        <aside className="card flex min-h-0 flex-col overflow-y-auto p-3 xl:col-span-1">
          <p className="section-title">Actions</p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => void save()} className="btn btn-secondary w-full">
              Save
            </button>
            <button
              type="button"
              onClick={() => void compileAndPreview()}
              className="btn btn-primary w-full"
              disabled={previewBusy}
            >
              {previewBusy ? 'Compiling…' : 'Compile'}
            </button>
            <button type="button" onClick={() => void downloadPdf()} className="btn btn-secondary w-full">
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => void score()}
              className="btn btn-secondary w-full"
              disabled={scoring}
            >
              {scoring ? 'Scoring…' : 'Re-check score'}
            </button>
            <button type="button" onClick={() => void remove()} className="btn btn-danger w-full">
              Delete
            </button>
          </div>

          {status && (
            <p className="mt-3 text-xs leading-relaxed text-[var(--color-soft)]" role="status">
              {status}
            </p>
          )}

          <div className="mt-4 border-t border-[var(--color-line)] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-xs font-semibold tracking-wide">ATS score</h2>
              {overall != null && job?.status === 'complete' && (
                <button type="button" className="btn btn-secondary text-xs py-0.5 px-1.5" onClick={copyScore}>
                  Copy
                </button>
              )}
            </div>
            {job ? (
              <div className="space-y-2">
                <ProgressStepper status={job.status} />
                {job.result_json && (
                  <>
                    <p className="font-display text-3xl font-semibold tabular-nums text-[var(--color-accent)]">
                      {overall ?? '—'}
                      <span className="text-sm text-[var(--color-muted)]">/100</span>
                    </p>
                    <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                      {cats.map((c) => (
                        <li key={c.name} className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5">
                          <div className="flex justify-between gap-1">
                            <span className="truncate">{c.name}</span>
                            <span className="tabular-nums">{c.score}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {job.error && <p className="text-xs text-[var(--color-danger)]">{job.error}</p>}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">Score to see categories.</p>
            )}
          </div>

          <div className="mt-4 border-t border-[var(--color-line)] pt-3">
            <h2 className="font-display text-xs font-semibold tracking-wide">Coach</h2>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">Fixed actions only</p>
            <textarea
              id="jd"
              className="input mt-2 h-16 resize-y text-xs"
              placeholder="JD (optional)"
              maxLength={4000}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
            <div className="mt-2 flex flex-col gap-1.5">
              {COACH_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-primary w-full text-xs py-1.5"
                  disabled={coaching}
                  onClick={() => void runCoach(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {chatReply && (
              <p className="mt-2 max-h-24 overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 text-xs leading-relaxed">
                {chatReply}
              </p>
            )}
            {proposed && (
              <div className="mt-2 rounded border border-amber-500/50 bg-amber-500/5 p-2">
                <p className="text-xs font-medium text-amber-700">Edit · {proposed.section}</p>
                <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-[var(--color-soft)]">
                  {proposed.after}
                </pre>
                <div className="mt-2 flex gap-1">
                  <button type="button" onClick={() => void applyEdit()} className="btn btn-warn text-xs py-1">
                    Apply
                  </button>
                  <button type="button" className="btn btn-secondary text-xs py-1" onClick={() => setProposed(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* EDITOR 2/5 */}
        <section className="card flex min-h-0 flex-col overflow-hidden p-3 xl:col-span-2">
          <h2 className="section-title shrink-0">
            {resume.track === 'latex' ? 'LaTeX editor' : 'Structured form'}
          </h2>
          <div className="min-h-0 flex-1 overflow-auto">
            {resume.track === 'latex' ? (
              <textarea
                className="input h-full min-h-[20rem] w-full resize-none font-mono text-[13px] leading-relaxed"
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
          </div>
        </section>

        {/* PREVIEW 2/5 */}
        <section className="card flex min-h-0 flex-col overflow-hidden xl:col-span-2">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
            <div>
              <h2 className="font-display text-sm font-semibold">PDF preview</h2>
              <p className="text-[10px] text-[var(--color-muted)]">
                {previewBusy ? 'Updating…' : engine === 'tectonic' ? 'Tectonic (real TeX)' : 'Live'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary text-xs py-1"
              onClick={() => void compileAndPreview()}
              disabled={previewBusy}
            >
              Refresh
            </button>
          </div>
          <div className="min-h-0 flex-1 bg-[var(--color-panel-2)] p-2">
            {previewUrl ? (
              <iframe
                title="Resume PDF preview"
                src={previewUrl}
                className="h-full w-full rounded border border-[var(--color-line)] bg-white"
              />
            ) : (
              <div className="flex h-full min-h-[16rem] items-center justify-center text-sm text-[var(--color-muted)]">
                {previewBusy ? 'Rendering…' : 'Click Compile — preview opens here (2/5)'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
