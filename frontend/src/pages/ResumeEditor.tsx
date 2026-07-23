import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  defaultSelectedIndices,
  filterSelectedHunks,
  findHunkRanges,
} from '../lib/hunks'

type EditHunk = { find: string; replace: string }
type ProposedEdit = { section: string; before?: string; hunks: EditHunk[] }
type EditorTab = 'form' | 'source'

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
  const [selectedHunks, setSelectedHunks] = useState<number[]>([])
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
  const [editorTab, setEditorTab] = useState<EditorTab>('source')
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
      const formish = r.track === 'structured' || !!r.template_id
      setEditorTab(formish && !(r.latex_body || '').trim() ? 'form' : formish ? 'form' : 'source')
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
    setSelectedHunks([])
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

  // Form/AI path: structured track or legacy template_id
  const isFormPath = !!resume && (resume.track === 'structured' || !!resume.template_id)
  const isLatexOnly = !!resume && !isFormPath
  const showForm = isFormPath && editorTab === 'form'
  const showSource = isLatexOnly || (isFormPath && editorTab === 'source')

  async function save(opts?: { quiet?: boolean }) {
    const tags = parseTags(tagsText)
    const r = await api<Resume>(`/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(
        isFormPath
          ? {
              title,
              structured_json: toApi(structured),
              tags,
              ...(latex.trim() ? { latex_body: latex } : {}),
            }
          : { title, latex_body: latex, tags },
      ),
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
    [dirty, id, latex, structured, tagsText, title, toast, isFormPath, editorTab],
  )

  useEffect(() => {
    if (!resume) return
    if (isFormPath && editorTab === 'form' && !latex.trim()) return
    const t = window.setTimeout(() => void compileAndPreview({ quiet: true }), 1200)
    return () => window.clearTimeout(t)
  }, [isFormPath ? (editorTab === 'form' ? structured : latex) : latex, title])

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
        used_llm?: boolean
      }>(`/resumes/${id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ structured_json: toApi(structured), title }),
      })
      setLatex(out.latex_body || '')
      setDiagnostics((out.diagnostics as LintDiagnostic[]) || [])
      setDirty(false)
      const r = await api<Resume>(`/resumes/${id}`)
      setResume(r)
      setEditorTab('source')
      const via = out.used_llm ? 'AI' : 'template fallback'
      if (out.status === 'ok') {
        toast.push(`LaTeX generated (${via}) · ${out.iterations} repair pass(es)`)
        setStatus(`Generated · ${via} · ok · ${out.iterations} iter`)
        await compileAndPreview({ quiet: true })
      } else {
        toast.push(out.error || `Generate finished with issues (${via})`)
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
      setEditorTab('source')
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
      if (dirty) await save({ quiet: true })
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
      if (out.proposed_edit?.hunks?.length) {
        setSelectedHunks(defaultSelectedIndices(out.proposed_edit.hunks.length))
        setEditorTab('source')
      }
      toast.push(out.proposed_edit?.hunks?.length ? 'Coach diffs ready — select in editor' : 'Coach reply ready')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Coach failed')
    } finally {
      setCoaching(false)
    }
  }

  async function applyEdit(indices: number[]) {
    if (!proposed?.hunks?.length) return
    const hunks = filterSelectedHunks(proposed.hunks, indices)
    if (!hunks.length) {
      toast.push('Select at least one hunk')
      return
    }
    const prev = latex
    setLatexBackup(prev)
    try {
      const r = await api<Resume>(`/resumes/${id}/apply-edit`, {
        method: 'POST',
        body: JSON.stringify({ section: proposed.section, hunks }),
      })
      setResume(r)
      if (r.latex_body != null) setLatex(r.latex_body || prev)
      else setStructured(fromApi(r.structured_json as Record<string, unknown>))
      setProposed(null)
      setSelectedHunks([])
      setDirty(false)
      setStatus(`Applied ${hunks.length} hunk(s)`)
      toast.push(`Applied ${hunks.length} hunk(s)`)
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

  const hunkMarks = useMemo(() => {
    if (!proposed?.hunks?.length || !latex) return []
    return findHunkRanges(latex, proposed.hunks, selectedHunks)
  }, [proposed, latex, selectedHunks])

  function focusHunk(i: number) {
    const h = proposed?.hunks?.[i]
    if (!h?.find) return
    setEditorTab('source')
    window.setTimeout(() => {
      latexRef.current?.findAndHighlight(h.find)
    }, 50)
  }

  function toggleHunk(i: number) {
    setSelectedHunks((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b),
    )
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
  const nSel = selectedHunks.length

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] flex-col gap-1.5" data-workspace="latex-editor">
      {/* Identity row */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5">
        <Link to="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← Resumes
        </Link>
        <input
          className="input max-w-[14rem] py-1 text-sm font-semibold"
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
        <label className="flex min-w-[8rem] max-w-sm flex-1 items-center gap-1 text-[10px] text-[var(--color-muted)]">
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

      {/* Actions toolbar — grouped, not competing with identity */}
      <div
        className="ws-toolbar shrink-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5"
        role="toolbar"
        aria-label="Workspace actions"
      >
        <div className="ws-toolbar-group">
          <span className="ws-toolbar-label">File</span>
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
          {hasLatexSource && (
            <button type="button" onClick={() => void downloadTex()} className={actionBtn}>
              .tex
            </button>
          )}
        </div>
        <div className="ws-toolbar-group">
          <span className="ws-toolbar-label">Build</span>
          <button
            type="button"
            onClick={() => void compileAndPreview()}
            className="btn btn-primary py-1 text-[11px] shrink-0"
            disabled={previewBusy}
          >
            {previewBusy ? '…' : 'Compile'}
          </button>
          {(isLatexOnly || editorTab === 'source') && (
            <button type="button" onClick={() => void runLint()} className={actionBtn} disabled={linting}>
              {linting ? '…' : 'Lint'}
            </button>
          )}
          <button type="button" onClick={() => void downloadPdf()} className={actionBtn}>
            PDF
          </button>
        </div>
        <div className="ws-toolbar-group">
          <span className="ws-toolbar-label">Score</span>
          <button type="button" onClick={() => void score()} className={actionBtn} disabled={scoring}>
            {scoring ? '…' : scoreLabel}
          </button>
        </div>
        <div className="ws-toolbar-group">
          <span className="ws-toolbar-label">Danger</span>
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

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 xl:grid-cols-12">
        {/* Left rail: versions · diagnostics · score */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded border border-[var(--color-line)] bg-[var(--color-panel)] p-2 xl:col-span-3">
          <div data-version-panel>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
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
                aria-label="Version commit message"
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
              <p className="mt-2 text-[10px] text-[var(--color-soft)]">No checkpoints yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {versions.map((v) => (
                  <li key={v.id} className="version-row" data-version-row>
                    <div className="version-row-meta">
                      <p className="truncate text-[12px] font-medium leading-snug" title={v.message}>
                        {v.message || 'checkpoint'}
                      </p>
                      <p className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted)]">
                        {new Date(v.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="version-row-actions">
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

          {diagnostics.length > 0 && (
            <div className="border-t border-[var(--color-line)] pt-2">
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
                        setEditorTab('source')
                        if (d.line != null) window.setTimeout(() => latexRef.current?.goToLine(d.line!), 40)
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
                Use <strong className="font-medium text-[var(--color-soft)]">Check score</strong> in the toolbar.
              </p>
            )}
          </div>
        </aside>

        {/* Editor column */}
        <section
          className="flex min-h-0 flex-col overflow-hidden rounded border border-[var(--color-line)] xl:col-span-5"
          style={{ background: showForm ? 'var(--color-panel)' : 'var(--editor-bg)' }}
          data-editor-pane
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-2 py-1 text-[10px]"
            style={{ color: 'var(--editor-gutter-fg)' }}
          >
            <div className="flex items-center gap-1">
              {isFormPath ? (
                <div className="flex gap-0.5" role="tablist" aria-label="Editor mode">
                  <button
                    type="button"
                    role="tab"
                    className="editor-tab"
                    aria-selected={editorTab === 'form'}
                    onClick={() => setEditorTab('form')}
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className="editor-tab"
                    aria-selected={editorTab === 'source'}
                    onClick={() => setEditorTab('source')}
                  >
                    Source
                  </button>
                </div>
              ) : (
                <span className="font-medium text-[var(--color-soft)]">LaTeX source</span>
              )}
              <span className="ml-1 text-[var(--color-muted)]">
                {showForm
                  ? 'Fill form → AI Generate · then review Source'
                  : 'Edit .tex · coach hunks highlight here'}
              </span>
            </div>
            {showSource && (
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

          {/* In-editor proposed diffs */}
          {proposed?.hunks?.length && showSource ? (
            <div className="editor-diff-strip shrink-0 p-2" data-editor-diff-strip role="region" aria-label="Editor diffs">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                <p className="text-[10px] font-semibold text-[var(--color-warn)]">
                  Proposed diffs · {nSel}/{proposed.hunks.length} selected · highlighted in source
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-warn py-0.5 text-[10px]"
                    disabled={nSel === 0}
                    data-apply-selected
                    onClick={() => void applyEdit(selectedHunks)}
                  >
                    Apply selected ({nSel})
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary py-0.5 text-[10px]"
                    onClick={() => void applyEdit(defaultSelectedIndices(proposed.hunks.length))}
                  >
                    Apply all
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary py-0.5 text-[10px]"
                    onClick={() => {
                      setProposed(null)
                      setSelectedHunks([])
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <ul className="space-y-1">
                {proposed.hunks.map((h, i) => {
                  const on = selectedHunks.includes(i)
                  return (
                    <li
                      key={i}
                      className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-1 font-mono text-[10px]"
                      data-hunk-row={i}
                    >
                      <label className="flex cursor-pointer items-start gap-1.5">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={on}
                          onChange={() => toggleHunk(i)}
                          aria-label={`Select hunk ${i + 1}`}
                          data-hunk-checkbox={i}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => focusHunk(i)}
                          title="Scroll to in editor"
                        >
                          <div className="text-[var(--color-danger)]">− {h.find.slice(0, 160)}</div>
                          <div className="text-[var(--color-accent)]">+ {h.replace.slice(0, 160)}</div>
                        </button>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
            {showForm ? (
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
                hunkMarks={hunkMarks}
              />
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded border border-[var(--color-line)] xl:col-span-4">
          <PdfPreview data={pdfData} busy={previewBusy || generating} />
        </section>
      </div>

      <CoachChat
        jd={jd}
        onJdChange={setJd}
        coaching={coaching}
        chatReply={chatReply}
        proposed={proposed}
        selectedHunks={selectedHunks}
        onSelectedHunksChange={setSelectedHunks}
        onAction={(a) => void runCoach(a)}
        onApplySelected={() => void applyEdit(selectedHunks)}
        onApplyAll={() =>
          void applyEdit(proposed ? defaultSelectedIndices(proposed.hunks.length) : [])
        }
        onDismiss={() => {
          setProposed(null)
          setSelectedHunks([])
        }}
        hasUndoSrc={!!latexBackup}
        onUndoSrc={() => {
          setLatex(latexBackup)
          setDirty(true)
          toast.push('Restored previous LaTeX')
        }}
        onFocusHunk={focusHunk}
      />
    </div>
  )
}
