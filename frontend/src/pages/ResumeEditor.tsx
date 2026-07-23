import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  downloadFile,
  fetchPdfBytes,
  type Job,
  type LatexVersion,
  type LintDiagnostic,
  type Resume,
  type TemplateInfo,
} from '../api/client'
import { ProgressStepper } from '../components/ProgressStepper'
import { LatexEditor, type LatexEditorHandle } from '../components/LatexEditor'
import { PdfPreview } from '../components/PdfPreview'
import {
  StructuredForm,
  fromApi,
  toApi,
  type StructuredResume,
} from '../components/StructuredForm'
import { CoachChat, type CoachActionId } from '../components/CoachChat'
import { useToast } from '../toast'

type EditHunk = { find: string; replace: string }
type ProposedEdit = { section: string; before?: string; hunks: EditHunk[] }

export function ResumeEditor() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const latexRef = useRef<LatexEditorHandle | null>(null)
  const [resume, setResume] = useState<Resume | null>(null)
  const [title, setTitle] = useState('')
  const [latex, setLatex] = useState('')
  const [latexBackup, setLatexBackup] = useState('')
  const [structured, setStructured] = useState<StructuredResume>(fromApi(null))
  const [jd, setJd] = useState('')
  const [chatReply, setChatReply] = useState('')
  const [proposed, setProposed] = useState<ProposedEdit | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [status, setStatus] = useState('')
  const [scoring, setScoring] = useState(false)
  const [coaching, setCoaching] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [hasPdf, setHasPdf] = useState(false)
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [engine, setEngine] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [versions, setVersions] = useState<LatexVersion[]>([])
  const [tagsText, setTagsText] = useState('')
  const [linting, setLinting] = useState(false)
  const [diagnostics, setDiagnostics] = useState<LintDiagnostic[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [templateMeta, setTemplateMeta] = useState<TemplateInfo | null>(null)
  const compilingRef = useRef(false)

  async function load() {
    setLoadErr('')
    try {
      const r = await api<Resume>(`/resumes/${id}`)
      setResume(r)
      setTitle(r.title)
      setLatex(r.latex_body || '')
      setLatexBackup(r.latex_body || '')
      setStructured(fromApi(r.structured_json as Record<string, unknown>))
      setTagsText((r.tags || []).join(', '))
      setDirty(false)
      if (r.template_id) {
        try {
          const tpls = await api<TemplateInfo[]>('/templates')
          setTemplateMeta(tpls.find((t) => t.id === r.template_id) || null)
        } catch {
          setTemplateMeta(null)
        }
      } else {
        setTemplateMeta(null)
      }
    } catch (ex) {
      setResume(null)
      setLoadErr(ex instanceof Error ? ex.message : 'Failed to load resume')
    }
  }

  useEffect(() => {
    void load()
    setPdfData(null)
    setHasPdf(false)
    setJob(null)
    setChatReply('')
    setProposed(null)
    setDiagnostics([])
    setStatus('')
    setTemplateMeta(null)
  }, [id])

  function parseTags(text: string): string[] {
    return text
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  }

  // Form path: template or structured with form data → AI generate primary
  const isFormPath = !!resume?.template_id || resume?.track === 'structured'
  const isLatexOnly = !!resume && !isFormPath

  async function save(opts?: { quiet?: boolean }) {
    const tags = parseTags(tagsText)
    const body: Record<string, unknown> = isFormPath
      ? { title, structured_json: toApi(structured), tags }
      : { title, latex_body: latex, tags }
    const r = await api<Resume>(`/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    setResume(r)
    setTitle(r.title)
    setTagsText((r.tags || []).join(', '))
    if (r.latex_body != null) setLatex(r.latex_body)
    setStructured(fromApi(r.structured_json as Record<string, unknown>))
    setDirty(false)
    setStatus('Saved')
    if (!opts?.quiet) toast.push('Saved')
    return r
  }

  async function runLint() {
    if (!latex.trim()) return
    setLinting(true)
    try {
      if (dirty) await save()
      const out = await api<{ diagnostics: LintDiagnostic[] }>(`/resumes/${id}/lint`, {
        method: 'POST',
        body: JSON.stringify({ latex_body: latex, compile: true }),
      })
      setDiagnostics(out.diagnostics || [])
      const n = out.diagnostics?.length ?? 0
      setStatus(n === 0 ? 'Lint clean' : `Lint: ${n} issue${n === 1 ? '' : 's'}`)
      toast.push(n === 0 ? 'No lint issues' : `${n} lint issue${n === 1 ? '' : 's'}`)
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Lint failed')
    } finally {
      setLinting(false)
    }
  }

  const compileAndPreview = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (compilingRef.current) return
      compilingRef.current = true
      setPreviewBusy(true)
      try {
        if (dirty) await save({ quiet: true })
        const out = await api<{
          message: string
          bytes?: number
          engine?: string
        }>(`/resumes/${id}/compile`, { method: 'POST' })
        setEngine(out.engine || '')
        const bytes = await fetchPdfBytes(`/resumes/${id}/pdf?inline=1`)
        setPdfData(bytes)
        setHasPdf(true)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirty, id, latex, structured, tagsText, title, toast, isFormPath],
  )

  useEffect(() => {
    if (!resume) return
    const t = window.setTimeout(() => void compileAndPreview({ quiet: true }), 1200)
    return () => window.clearTimeout(t)
  }, [isFormPath ? structured : latex, title])

  async function generateLatex() {
    setGenerating(true)
    try {
      if (dirty) await save({ quiet: true })
      const out = await api<{
        latex_body: string
        status: string
        iterations: number
        diagnostics?: LintDiagnostic[]
        error?: string | null
      }>(`/resumes/${id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ structured_json: toApi(structured), title }),
      })
      setLatex(out.latex_body || '')
      setDiagnostics((out.diagnostics as LintDiagnostic[]) || [])
      setDirty(false)
      const r = await api<Resume>(`/resumes/${id}`)
      setResume(r)
      if (out.status === 'ok') {
        toast.push(`LaTeX generated · ${out.iterations} repair pass(es)`)
        setStatus(`Generated · ok · ${out.iterations} iter`)
        await compileAndPreview({ quiet: true })
      } else {
        toast.push(out.error || 'Generate finished with lint/compile issues')
        setStatus(out.error || 'Generate failed quality loop')
      }
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Generate failed')
    } finally {
      setGenerating(false)
    }
  }

  async function downloadPdf() {
    try {
      if (!hasPdf) await compileAndPreview({ quiet: true })
      await downloadFile(`/resumes/${id}/pdf`, `${(title || 'resume').replace(/\s+/g, '_')}.pdf`)
      toast.push('PDF download started')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Download failed')
    }
  }

  async function downloadTex() {
    try {
      if (dirty) await save({ quiet: true })
      await downloadFile(`/resumes/${id}/tex`, `${(title || 'resume').replace(/\s+/g, '_')}.tex`)
      toast.push('LaTeX download started')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'LaTeX download failed')
    }
  }

  async function loadVersions() {
    try {
      setVersions(await api<LatexVersion[]>(`/resumes/${id}/versions`))
    } catch {
      setVersions([])
    }
  }

  useEffect(() => {
    if (id) void loadVersions()
  }, [id])

  async function commitVersion() {
    if (dirty) await save()
    try {
      const out = await api<{ unchanged?: boolean; version?: LatexVersion }>(
        `/resumes/${id}/versions`,
        {
          method: 'POST',
          body: JSON.stringify({ message: commitMsg || 'checkpoint' }),
        },
      )
      if (out.unchanged) toast.push('No changes since last commit')
      else toast.push('Version saved')
      setCommitMsg('')
      await loadVersions()
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Commit failed')
    }
  }

  async function restoreVersion(vid: string) {
    try {
      const r = await api<Resume>(`/resumes/${id}/versions/${vid}/restore`, {
        method: 'POST',
        body: '{}',
      })
      setResume(r)
      setLatex(r.latex_body || '')
      setDirty(false)
      toast.push('Restored version')
      void compileAndPreview({ quiet: true })
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Restore failed')
    }
  }

  async function deleteVersion(vid: string, message: string) {
    if (!confirm(`Delete checkpoint “${message.slice(0, 40)}”?`)) return
    try {
      await api(`/resumes/${id}/versions/${vid}`, { method: 'DELETE' })
      toast.push('Checkpoint deleted')
      await loadVersions()
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Delete failed')
    }
  }

  async function score() {
    if (dirty) await save()
    setScoring(true)
    setStatus('Scoring… (cached GitHub + LLM)')
    try {
      const j = await api<Job>(`/resumes/${id}/score`, {
        method: 'POST',
        body: JSON.stringify({ job_description: jd.slice(0, 4000) || null }),
      })
      setJob(j)
      let finished = false
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 500))
        const cur = await api<Job>(`/jobs/${j.id}`)
        setJob(cur)
        if (cur.status === 'complete' || cur.status === 'failed') {
          finished = true
          const eng = cur.result_json as {
            engine?: string
            duration_ms?: number
            github_cache?: string
          } | null
          setStatus(
            `${cur.status}${eng?.engine ? ` · ${eng.engine}` : ''}${
              eng?.duration_ms != null ? ` · ${eng.duration_ms}ms` : ''
            }${eng?.github_cache ? ` · gh:${eng.github_cache}` : ''}`,
          )
          toast.push(
            cur.status === 'complete'
              ? `Score: ${cur.result_json?.overall_score ?? '—'}`
              : `Score failed: ${cur.error || ''}`,
          )
          break
        }
      }
      if (!finished) {
        setStatus('Score timed out — try again')
        toast.push('Score timed out — try again')
      }
    } catch (ex) {
      setStatus(ex instanceof Error ? ex.message : 'Score failed')
      toast.push(ex instanceof Error ? ex.message : 'Score failed')
    } finally {
      setScoring(false)
    }
  }

  async function runCoach(action: CoachActionId) {
    setCoaching(true)
    try {
      const out = await api<{ reply: string; proposed_edit: ProposedEdit | null }>(
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
      toast.push(out.proposed_edit?.hunks?.length ? 'Coach diffs ready' : 'Coach reply ready')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Coach failed')
    } finally {
      setCoaching(false)
    }
  }

  async function applyEdit() {
    if (!proposed?.hunks?.length) return
    const prev = latex
    setLatexBackup(prev)
    try {
      const r = await api<Resume>(`/resumes/${id}/apply-edit`, {
        method: 'POST',
        body: JSON.stringify({ section: proposed.section, hunks: proposed.hunks }),
      })
      setResume(r)
      if (r.latex_body != null) setLatex(r.latex_body || prev)
      else setStructured(fromApi(r.structured_json as Record<string, unknown>))
      setProposed(null)
      setDirty(false)
      setStatus('Edit applied')
      toast.push('Edit applied')
      try {
        await compileAndPreview({ quiet: true })
      } catch {
        setLatex(prev)
        toast.push('Compile failed after apply — reverted source')
        await api(`/resumes/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ latex_body: prev }),
        })
      }
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Apply rejected')
    }
  }

  async function remove() {
    if (!resume || !confirm(`Delete “${resume.title}”?`)) return
    await api(`/resumes/${id}`, { method: 'DELETE' })
    toast.push('Deleted')
    nav('/')
  }

  if (loadErr) {
    return (
      <div className="card mx-auto mt-12 max-w-md p-6 text-center">
        <p className="font-display text-lg font-semibold">Could not open resume</p>
        <p className="mt-2 text-sm text-[var(--color-danger)]" role="alert">
          {loadErr}
        </p>
        <Link to="/" className="btn btn-primary mt-4 inline-flex">
          ← Back to resumes
        </Link>
      </div>
    )
  }

  if (!resume) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-soft)]" role="status">
        Loading resume…
      </div>
    )
  }

  const cats = job?.result_json?.categories || []
  const overall = job?.result_json?.overall_score
  const meta = job?.result_json as
    | { engine?: string; github_enriched?: boolean; duration_ms?: number }
    | null
    | undefined
  const hasLatexSource = !!(resume.latex_body || resume.track === 'latex' || latex)
  const scoreLabel =
    job?.status === 'complete' || job?.status === 'failed' ? 'Re-check score' : 'Check score'

  const actionBtn = 'btn btn-secondary py-1 text-[11px] shrink-0'

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col gap-1.5">
      {/* Header: title, tags, then Actions to the right of tags */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5">
        <Link to="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← Resumes
        </Link>
        <input
          className="input max-w-[12rem] py-1 text-sm font-semibold"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
          aria-label="Resume title"
        />
        <span className="chip" title="Resume track">
          {resume.track}
        </span>
        {engine && (
          <span className="chip" title="Compile engine">
            {engine}
          </span>
        )}
        {dirty ? (
          <span className="chip border-[var(--color-warn)] text-[var(--color-warn)]">Unsaved</span>
        ) : (
          <span className="text-[10px] text-[var(--color-muted)]">Saved</span>
        )}
        <label className="flex min-w-[8rem] max-w-xs flex-1 items-center gap-1 text-[10px] text-[var(--color-muted)]">
          Tags
          <input
            className="input min-w-0 flex-1 py-0.5 text-[11px]"
            placeholder="internship, faang, …"
            value={tagsText}
            onChange={(e) => {
              setTagsText(e.target.value)
              setDirty(true)
            }}
            aria-label="Resume tags"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1 border-l border-[var(--color-line)] pl-2" role="toolbar" aria-label="Actions">
          <button type="button" onClick={() => void save()} className={actionBtn}>
            Save
          </button>
          {isFormPath && (
            <button
              type="button"
              onClick={() => void generateLatex()}
              className="btn btn-primary py-1 text-[11px] shrink-0"
              disabled={generating}
            >
              {generating ? 'Generating…' : 'AI Generate'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void compileAndPreview()}
            className="btn btn-primary py-1 text-[11px] shrink-0"
            disabled={previewBusy}
          >
            {previewBusy ? '…' : 'Compile'}
          </button>
          {isLatexOnly && (
            <button type="button" onClick={() => void runLint()} className={actionBtn} disabled={linting}>
              {linting ? '…' : 'Lint'}
            </button>
          )}
          <button type="button" onClick={() => void downloadPdf()} className={actionBtn}>
            PDF
          </button>
          {hasLatexSource && (
            <button type="button" onClick={() => void downloadTex()} className={actionBtn}>
              .tex
            </button>
          )}
          <button type="button" onClick={() => void score()} className={actionBtn} disabled={scoring}>
            {scoring ? '…' : scoreLabel}
          </button>
          <button type="button" onClick={() => void remove()} className="btn btn-danger py-1 text-[11px] shrink-0">
            Delete
          </button>
        </div>
      </div>
      {status && (
        <p className="px-1 text-[10px] text-[var(--color-soft)]" role="status">
          {status}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 xl:grid-cols-5">
        <aside className="flex min-h-0 flex-col gap-1.5 overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-panel)] p-2 xl:col-span-1">
          {diagnostics.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Diagnostics ({diagnostics.length})
              </p>
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {diagnostics.map((d, i) => (
                  <li key={`${d.source}-${d.line}-${i}`}>
                    <button
                      type="button"
                      className="w-full rounded bg-[var(--color-panel-2)] px-1.5 py-1 text-left text-[10px]"
                      onClick={() => {
                        if (d.line != null) latexRef.current?.goToLine(d.line)
                      }}
                    >
                      <span
                        className={
                          d.severity === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-warn)]'
                        }
                      >
                        {d.severity}
                      </span>
                      {d.line != null && <span className="text-[var(--color-muted)]"> · L{d.line}</span>}
                      <span className="mt-0.5 block text-[var(--color-soft)]">{d.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-[var(--color-line)] pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Versions
            </p>
            <div className="flex gap-1">
              <input
                className="input min-w-0 flex-1 py-1 text-[11px]"
                placeholder="Commit message"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitVersion()
                }}
              />
              <button type="button" className="btn btn-secondary shrink-0 py-1 text-[11px]" onClick={() => void commitVersion()}>
                Commit
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="mt-1.5 text-[10px] text-[var(--color-soft)]">No checkpoints yet.</p>
            ) : (
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-start justify-between gap-1 rounded bg-[var(--color-panel-2)] px-1.5 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium" title={v.message}>
                        {v.message || 'checkpoint'}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted)]">
                        {new Date(v.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button
                        type="button"
                        className="btn btn-secondary py-0.5 text-[10px]"
                        onClick={() => {
                          if (confirm(`Restore “${(v.message || '').slice(0, 40)}”?`)) {
                            void restoreVersion(v.id)
                          }
                        }}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger py-0.5 text-[10px]"
                        onClick={() => void deleteVersion(v.id, v.message || 'checkpoint')}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--color-line)] pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              ATS score
            </p>
            {job ? (
              <div className="space-y-1.5">
                <ProgressStepper status={job.status} />
                {meta?.engine && (
                  <p className="text-[10px] text-[var(--color-muted)]">
                    Engine: {meta.engine}
                    {meta.github_enriched ? ' · GitHub' : ''}
                    {meta.duration_ms != null ? ` · ${meta.duration_ms}ms` : ''}
                  </p>
                )}
                {job.result_json && job.status === 'complete' && (
                  <>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-semibold tabular-nums text-[var(--color-accent)]">
                        {overall ?? '—'}
                      </p>
                      <span className="text-[10px] text-[var(--color-muted)]">/ 100</span>
                    </div>
                    <ul className="max-h-36 space-y-1 overflow-y-auto text-[10px]">
                      {cats.map((c) => (
                        <li key={c.name} className="rounded bg-[var(--color-panel-2)] px-1.5 py-1">
                          <div className="flex justify-between gap-1 font-medium">
                            <span className="truncate">{c.name.replace(/_/g, ' ')}</span>
                            <span className="tabular-nums text-[var(--color-accent)]">{c.score}</span>
                          </div>
                          {c.evidence && (
                            <p className="mt-0.5 leading-snug text-[var(--color-muted)]">{c.evidence}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {job.error && (
                  <p className="text-[10px] text-[var(--color-danger)]" role="alert">
                    {job.error}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--color-muted)]">
                Use <strong className="font-medium text-[var(--color-soft)]">Check score</strong> in the header.
              </p>
            )}
          </div>
        </aside>

        <section
          className="flex min-h-0 flex-col overflow-hidden rounded border border-[var(--color-line)] xl:col-span-2"
          style={{ background: isFormPath ? 'var(--color-panel)' : 'var(--editor-bg)' }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-2 py-1 text-[10px]"
            style={{ color: 'var(--editor-gutter-fg)' }}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--color-soft)]">
                {isFormPath ? 'Structured form' : 'LaTeX source'}
              </span>
              <span className="text-[var(--color-muted)]">
                {isFormPath
                  ? 'Fill form → AI Generate builds LaTeX (lint/compile loop) · Download .tex anytime'
                  : 'Paste or edit .tex · layout stays yours'}
              </span>
            </div>
            {isLatexOnly && (
              <span className="flex gap-0.5">
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-sm hover:bg-[var(--editor-active)]"
                  title="Undo"
                  aria-label="Undo"
                  onClick={() => latexRef.current?.undo()}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-sm hover:bg-[var(--editor-active)]"
                  title="Redo"
                  aria-label="Redo"
                  onClick={() => latexRef.current?.redo()}
                >
                  ↷
                </button>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {isFormPath ? (
              <div className="h-full overflow-auto bg-[var(--color-panel)] p-2">
                <StructuredForm
                  value={structured}
                  onChange={(v) => {
                    setStructured(v)
                    setDirty(true)
                  }}
                  visibleFields={templateMeta?.fields}
                  visibleSections={templateMeta?.sections}
                />
              </div>
            ) : (
              <LatexEditor
                value={latex}
                onChange={(v) => {
                  setLatex(v)
                  setDirty(true)
                }}
                editorRef={latexRef}
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded border border-[var(--color-line)] xl:col-span-2">
          <PdfPreview data={pdfData} busy={previewBusy || generating} />
        </section>
      </div>

      <CoachChat
        jd={jd}
        onJdChange={setJd}
        coaching={coaching}
        chatReply={chatReply}
        proposed={proposed}
        onAction={(a) => void runCoach(a)}
        onApply={() => void applyEdit()}
        onDismiss={() => setProposed(null)}
        hasUndoSrc={!!latexBackup}
        onUndoSrc={() => {
          setLatex(latexBackup)
          setDirty(true)
          toast.push('Restored previous LaTeX')
        }}
      />
    </div>
  )
}
