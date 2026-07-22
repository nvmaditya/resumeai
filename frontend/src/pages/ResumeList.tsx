import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Resume, type TemplateInfo } from '../api/client'
import { useToast } from '../toast'

export function ResumeList() {
  const nav = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState<Resume[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

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
    void api<TemplateInfo[]>('/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [])

  async function createLatex() {
    setBusy(true)
    try {
      const r = await api<Resume>('/resumes', {
        method: 'POST',
        body: JSON.stringify({
          title: 'LaTeX resume',
          track: 'latex',
          latex_body:
            '\\documentclass{article}\n\\begin{document}\nYour name\n\\end{document}\n',
        }),
      })
      toast.push('Resume created')
      nav(`/resumes/${r.id}`)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function createFromTemplate(t: TemplateInfo) {
    setBusy(true)
    try {
      const r = await api<Resume>('/resumes', {
        method: 'POST',
        body: JSON.stringify({
          title: t.title,
          track: 'latex',
          template_id: t.id,
        }),
      })
      toast.push(`Created from ${t.title}`)
      setPickerOpen(false)
      nav(`/resumes/${r.id}`)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete “${title}”? This cannot be undone.`)) return
    await api(`/resumes/${id}`, { method: 'DELETE' })
    toast.push('Resume deleted')
    void load()
  }

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const r of items) for (const t of r.tags || []) s.add(t)
    return [...s].sort()
  }, [items])

  function toggleTagFilter(tag: string) {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    )
  }

  const filtered = items.filter((r) => {
    const textOk =
      !q ||
      r.title.toLowerCase().includes(q.toLowerCase()) ||
      r.track.toLowerCase().includes(q.toLowerCase()) ||
      (r.tags || []).some((t) => t.toLowerCase().includes(q.toLowerCase()))
    const tagsOk =
      tagFilter.length === 0 ||
      tagFilter.every((tf) => (r.tags || []).includes(tf))
    return textOk && tagsOk
  })

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your resumes</h1>
          <p className="mt-1 text-sm text-[var(--color-soft)]">
            {items.length === 0
              ? 'Create a blank LaTeX resume or start from a template'
              : `${items.length} resume${items.length === 1 ? '' : 's'} · open one to score, coach, and compile`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void createLatex()}
            className="btn btn-primary"
          >
            {busy ? 'Working…' : 'New LaTeX'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPickerOpen(true)}
            className="btn btn-secondary"
          >
            From template
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mb-4 space-y-2">
          <div>
            <label className="label" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              className="input max-w-md"
              placeholder="Filter by title, track, or tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--color-muted)]">Tags:</span>
              {allTags.map((t) => {
                const on = tagFilter.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    className={
                      on
                        ? 'chip border border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                        : 'chip hover:border-[var(--color-accent)]'
                    }
                    onClick={() => toggleTagFilter(t)}
                  >
                    {t}
                  </button>
                )
              })}
              {tagFilter.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-[var(--color-muted)] underline"
                  onClick={() => setTagFilter([])}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="mb-4 text-sm text-[var(--color-danger)]" role="alert">
          {err}
        </p>
      )}

      {items.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <p className="font-display text-lg font-medium">No resumes yet</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--color-soft)]">
            Create a blank LaTeX resume or start from a template.
          </p>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void createLatex()}
            >
              New LaTeX
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setPickerOpen(true)}
            >
              From template
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-soft)]">No resumes match your filters.</p>
          <button
            type="button"
            className="btn btn-secondary mt-3 text-xs"
            onClick={() => {
              setQ('')
              setTagFilter([])
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((r) => (
            <li key={r.id} className="card flex items-center gap-3 px-4 py-3">
              <Link
                to={`/resumes/${r.id}`}
                className="min-w-0 flex-1 group flex items-center justify-between gap-4 py-1"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium group-hover:text-[var(--color-accent)]">
                      {r.title}
                    </span>
                    <span className="chip">{r.track}</span>
                    {(r.tags || []).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted)]">
                    {r.id.slice(0, 8)}…
                  </p>
                </div>
                <span className="text-[var(--color-muted)] group-hover:text-[var(--color-accent)]">
                  →
                </span>
              </Link>
              <button
                type="button"
                className="btn btn-danger text-xs py-1.5 shrink-0"
                onClick={() => void remove(r.id, r.title)}
                aria-label={`Delete ${r.title}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close template picker"
            onClick={() => setPickerOpen(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Pick template"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">From template</h2>
              <button
                type="button"
                className="text-sm text-[var(--color-muted)]"
                onClick={() => setPickerOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Copies the template LaTeX into a new resume you can edit.
            </p>
            {templates.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No templates found.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="btn btn-secondary w-full justify-start text-left"
                      disabled={busy}
                      onClick={() => void createFromTemplate(t)}
                    >
                      {t.title}
                      <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">
                        {t.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
