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
import { useToast } from '../toast'

const COACH_ACTIONS = [
  { id: 'improve_score', label: 'Improve score' },
  { id: 'strengthen_projects', label: 'Strengthen projects' },
  { id: 'align_jd', label: 'Align to JD' },
  { id: 'quantify_impact', label: 'Quantify impact' },
] as const

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
  // form | latex view for dual-mode resumes (template / latex track)
  const [editView, setEditView] = useState<'form' | 'latex'>('latex')
  const compilingRef = useRef(false)

  async function load() {
    const r = await api<Resume>(`/resumes/${id}`)
    setResume(r)
    setTitle(r.title)
    setLatex(r.latex_body || '')
    setLatexBackup(r.latex_body || '')
    setStructured(fromApi(r.structured_json as Record<string, unknown>))
    setTagsText((r.tags || []).join(', '))
    // templates default to form for filling; plain latex stays on source
    setEditView(r.template_id ? 'form' : r.track === 'latex' ? 'latex' : 'form')
    setDirty(false)
  }

  useEffect(() => {
    void load()
    setPdfData(null)
    setHasPdf(false)
  }, [id])

  function parseTags(text: string): string[] {
    return text
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  }

  const dualMode =
    !!resume && (resume.track === 'latex' || !!resume.template_id || !!resume.latex_body)

  async function save(opts?: { quiet?: boolean }) {
    const tags = parseTags(tagsText)
    // dual: persist both so Form ↔ LaTeX switch does not drop work
    // ponytail: no auto form→template fill; compile uses latex_body on latex track
    const body = dualMode
      ? { title, latex_body: latex, structured_json: toApi(structured), tags }
      : resume?.track === 'latex'
        ? { title, latex_body: latex, tags }
        : { title, structured_json: toApi(structured), tags }
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
    if (resume?.track !== 'latex') return
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
        if (dirty) {
          await save({ quiet: true })
        }
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
    [dirty, id, latex, resume, structured, tagsText, title, toast],
  )

  useEffect(() => {
    if (!resume) return
    const t = window.setTimeout(() => void compileAndPreview({ quiet: true }), 1000)
    return () => window.clearTimeout(t)
  }, [latex, structured, title])

  async function downloadPdf() {
    try {
      if (!hasPdf) await compileAndPreview({ quiet: true })
      await downloadFile(`/resumes/${id}/pdf`, `${(title || 'resume').replace(/\s+/g, '_')}.pdf`)
      toast.push('Download started')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Download failed')
    }
  }

  async function loadVersions() {
    try {
      const list = await api<LatexVersion[]>(`/resumes/${id}/versions`)
      setVersions(list)
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
      const out = await api<{ unchanged?: boolean; version?: LatexVersion }>(`/resumes/${id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ message: commitMsg || 'checkpoint' }),
      })
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
      const r = await api<Resume>(`/resumes/${id}/versions/${vid}/restore`, { method: 'POST', body: '{}' })
      setResume(r)
      setLatex(r.latex_body || '')
      setDirty(false)
      toast.push('Restored version')
      void compileAndPreview({ quiet: true })
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Restore failed')
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
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 500))
        const cur = await api<Job>(`/jobs/${j.id}`)
        setJob(cur)
        if (cur.status === 'complete' || cur.status === 'failed') {
          const eng = cur.result_json as {
            engine?: string
            duration_ms?: number
            github_enriched?: boolean
            github_cache?: string
          } | null
          setStatus(
            `${cur.status}${eng?.engine ? ` · ${eng.engine}` : ''}${
              eng?.duration_ms != null ? ` · ${eng.duration_ms}ms` : ''
            }${eng?.github_cache ? ` · gh:${eng.github_cache}` : ''}`,
          )
          toast.push(
            cur.status === 'complete'
              ? `Score: ${cur.result_json?.overall_score ?? '—'} (gh ${eng?.github_cache || '—'})`
              : `Score failed: ${cur.error || ''}`,
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
      if (r.track === 'latex') setLatex(r.latex_body || prev)
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

  if (!resume) {
    return <p className="text-sm text-[var(--color-soft)]">Loading…</p>
  }

  const cats = job?.result_json?.categories || []
  const overall = job?.result_json?.overall_score
  const meta = job?.result_json as
    | { engine?: string; github_enriched?: boolean; duration_ms?: number }
    | null
    | undefined

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-0.5">
        <Link to="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← Resumes
        </Link>
        <input
          className="input max-w-xs py-1 text-sm font-semibold"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
          aria-label="Resume title"
        />
        <span className="chip">{resume.track}</span>
        {engine && <span className="chip">{engine}</span>}
        {dirty && <span className="text-xs text-amber-600">Unsaved</span>}
        <label className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-[var(--color-muted)]">
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
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 xl:grid-cols-5">
        <aside className="flex min-h-0 flex-col gap-1.5 overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-panel)] p-2 xl:col-span-1">
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => void save()} className="btn btn-secondary w-full py-1.5 text-xs">
              Save
            </button>
            <button
              type="button"
              onClick={() => void compileAndPreview()}
              className="btn btn-primary w-full py-1.5 text-xs"
              disabled={previewBusy}
            >
              {previewBusy ? 'Compiling…' : 'Compile'}
            </button>
            {resume.track === 'latex' && (
              <button
                type="button"
                onClick={() => void runLint()}
                className="btn btn-secondary w-full py-1.5 text-xs"
                disabled={linting}
              >
                {linting ? 'Linting…' : 'Lint LaTeX'}
              </button>
            )}
            <button type="button" onClick={() => void downloadPdf()} className="btn btn-secondary w-full py-1.5 text-xs">
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => void score()}
              className="btn btn-secondary w-full py-1.5 text-xs"
              disabled={scoring}
            >
              {scoring ? 'Scoring…' : 'Re-check score'}
            </button>
            <button type="button" onClick={() => void remove()} className="btn btn-danger w-full py-1.5 text-xs">
              Delete
            </button>
          </div>
          {status && <p className="text-[10px] leading-snug text-[var(--color-soft)]">{status}</p>}

          {diagnostics.length > 0 && (
            <div className="border-t border-[var(--color-line)] pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Lint ({diagnostics.length})
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {diagnostics.map((d, i) => (
                  <li key={`${d.source}-${d.line}-${i}`}>
                    <button
                      type="button"
                      className="w-full rounded bg-[var(--color-panel-2)] px-1.5 py-1 text-left text-[10px] leading-snug hover:ring-1 hover:ring-[var(--color-line)]"
                      onClick={() => {
                        if (d.line != null) latexRef.current?.goToLine(d.line)
                      }}
                    >
                      <span
                        className={
                          d.severity === 'error'
                            ? 'text-[var(--color-danger)]'
                            : 'text-amber-600'
                        }
                      >
                        {d.severity}
                      </span>
                      {d.line != null && (
                        <span className="text-[var(--color-muted)]"> · L{d.line}</span>
                      )}
                      <span className="text-[var(--color-muted)]"> · {d.source}</span>
                      <span className="mt-0.5 block text-[var(--color-soft)]">{d.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-[var(--color-line)] pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Version history
            </p>
            <p className="mb-1 text-[10px] text-[var(--color-muted)]">
              Snapshot LaTeX with a message (like a commit). Restore anytime.
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
              <button
                type="button"
                className="btn btn-secondary shrink-0 py-1 text-[11px]"
                onClick={() => void commitVersion()}
              >
                Commit
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="mt-1.5 text-[10px] text-[var(--color-soft)]">
                No versions yet — commit to save a checkpoint.
              </p>
            ) : (
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-start justify-between gap-1 rounded bg-[var(--color-panel-2)] px-1.5 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-[var(--color-text)]" title={v.message}>
                        {v.message || 'checkpoint'}
                      </p>
                      <p className="text-[10px] text-[var(--color-muted)]">
                        {new Date(v.created_at).toLocaleString()}
                        {v.size != null ? ` · ${v.size} B` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0 py-0.5 text-[10px]"
                      title="Replace current source with this version"
                      onClick={() => {
                        if (confirm(`Restore version “${(v.message || 'checkpoint').slice(0, 60)}”?`)) {
                          void restoreVersion(v.id)
                        }
                      }}
                    >
                      Restore
                    </button>
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
                    {meta.engine}
                    {meta.github_enriched ? ' · GitHub' : ''}
                    {meta.duration_ms != null ? ` · ${meta.duration_ms}ms` : ''}
                  </p>
                )}
                {job.result_json && job.status === 'complete' && (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-[var(--color-accent)]">
                      {overall ?? '—'}
                    </p>
                    <ul className="max-h-32 space-y-1 overflow-y-auto text-[10px]">
                      {cats.map((c) => (
                        <li key={c.name} className="rounded bg-[var(--color-panel-2)] px-1.5 py-1">
                          <div className="flex justify-between gap-1">
                            <span className="truncate">{c.name}</span>
                            <span>{c.score}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {job.error && <p className="text-[10px] text-[var(--color-danger)]">{job.error}</p>}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--color-muted)]">Score runs hiring-agent + GitHub.</p>
            )}
          </div>

          <div className="border-t border-[var(--color-line)] pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Coach
            </p>
            <textarea
              className="input h-14 resize-y text-[11px]"
              placeholder="JD optional"
              maxLength={4000}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
            <div className="mt-1 flex flex-col gap-1">
              {COACH_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-primary w-full py-1 text-[11px]"
                  disabled={coaching}
                  onClick={() => void runCoach(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {chatReply && (
              <p className="mt-1 max-h-20 overflow-y-auto text-[10px] leading-snug text-[var(--color-soft)]">
                {chatReply}
              </p>
            )}
            {proposed?.hunks?.length ? (
              <div className="mt-1 rounded border border-amber-500/40 bg-amber-500/5 p-1.5">
                <p className="text-[10px] font-medium text-amber-700">
                  Diffs · {proposed.section} · {proposed.hunks.length} hunk(s)
                </p>
                <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-[10px]">
                  {proposed.hunks.map((h, i) => (
                    <li key={i} className="rounded bg-black/5 p-1 font-mono">
                      <div className="text-red-700/90">− {h.find.slice(0, 120)}</div>
                      <div className="text-green-800/90">+ {h.replace.slice(0, 120)}</div>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex gap-1">
                  <button type="button" onClick={() => void applyEdit()} className="btn btn-warn py-0.5 text-[10px]">
                    Apply
                  </button>
                  <button type="button" className="btn btn-secondary py-0.5 text-[10px]" onClick={() => setProposed(null)}>
                    Dismiss
                  </button>
                  {latexBackup && (
                    <button
                      type="button"
                      className="btn btn-secondary py-0.5 text-[10px]"
                      onClick={() => {
                        setLatex(latexBackup)
                        setDirty(true)
                        toast.push('Restored previous LaTeX')
                      }}
                    >
                      Undo src
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section
          className="flex min-h-0 flex-col overflow-hidden rounded border border-[var(--color-line)] xl:col-span-2"
          style={{ background: 'var(--editor-bg)' }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-2 py-1 text-[10px]"
            style={{ color: 'var(--editor-gutter-fg)' }}
          >
            <div className="flex items-center gap-2">
              {dualMode ? (
                <div className="flex rounded border border-[var(--color-line)] p-0.5">
                  <button
                    type="button"
                    className={
                      editView === 'form'
                        ? 'rounded bg-[var(--editor-active)] px-2 py-0.5 font-medium'
                        : 'rounded px-2 py-0.5 opacity-70 hover:opacity-100'
                    }
                    onClick={() => setEditView('form')}
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    className={
                      editView === 'latex'
                        ? 'rounded bg-[var(--editor-active)] px-2 py-0.5 font-medium'
                        : 'rounded px-2 py-0.5 opacity-70 hover:opacity-100'
                    }
                    onClick={() => setEditView('latex')}
                  >
                    LaTeX
                  </button>
                </div>
              ) : (
                <span>Structured form</span>
              )}
              {dualMode && editView === 'form' && (
                <span className="text-[var(--color-muted)]">
                  PDF uses LaTeX · form saved for scoring
                </span>
              )}
            </div>
            {dualMode && editView === 'latex' && (
              <span className="flex gap-1">
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 hover:bg-[var(--editor-active)]"
                  title="Undo"
                  onClick={() => latexRef.current?.undo()}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 hover:bg-[var(--editor-active)]"
                  title="Redo"
                  onClick={() => latexRef.current?.redo()}
                >
                  Redo
                </button>
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {dualMode && editView === 'latex' ? (
              <LatexEditor
                value={latex}
                onChange={(v) => {
                  setLatex(v)
                  setDirty(true)
                }}
                editorRef={latexRef}
              />
            ) : (
              <div className="h-full overflow-auto bg-[var(--color-panel)] p-2">
                <StructuredForm
                  value={structured}
                  onChange={(v) => {
                    setStructured(v)
                    setDirty(true)
                  }}
                />
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded border border-[var(--color-line)] xl:col-span-2">
          <PdfPreview data={pdfData} busy={previewBusy} />
        </section>
      </div>
    </div>
  )
}
