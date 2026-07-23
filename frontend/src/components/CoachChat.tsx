import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultSelectedIndices } from '../lib/hunks'

export const COACH_ACTIONS = [
  { id: 'improve_score', label: 'Improve score' },
  { id: 'strengthen_projects', label: 'Strengthen projects' },
  { id: 'align_jd', label: 'Align to JD' },
  { id: 'quantify_impact', label: 'Quantify impact' },
] as const

export type CoachActionId = (typeof COACH_ACTIONS)[number]['id']

type EditHunk = { find: string; replace: string }
type ProposedEdit = { section: string; before?: string; hunks: EditHunk[] }

type Props = {
  jd: string
  onJdChange: (v: string) => void
  coaching: boolean
  chatReply: string
  proposed: ProposedEdit | null
  selectedHunks: number[]
  onSelectedHunksChange: (indices: number[]) => void
  onAction: (id: CoachActionId) => void
  onApplySelected: () => void
  onApplyAll: () => void
  onDismiss: () => void
  onUndoSrc?: () => void
  hasUndoSrc?: boolean
  onFocusHunk?: (index: number) => void
}

const POS_KEY = 'resumeai_chat_pos'

export function CoachChat({
  jd,
  onJdChange,
  coaching,
  chatReply,
  proposed,
  selectedHunks,
  onSelectedHunksChange,
  onAction,
  onApplySelected,
  onApplyAll,
  onDismiss,
  onUndoSrc,
  hasUndoSrc,
  onFocusHunk,
}: Props) {
  const [minimized, setMinimized] = useState(false)
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number }
        if (typeof p.x === 'number' && typeof p.y === 'number') return p
      }
    } catch {
      /* ignore */
    }
    return { x: 24, y: 80 }
  })
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null)

  useEffect(() => {
    localStorage.setItem(POS_KEY, JSON.stringify(pos))
  }, [pos])

  useEffect(() => {
    if (proposed?.hunks?.length) {
      onSelectedHunksChange(defaultSelectedIndices(proposed.hunks.length))
    } else {
      onSelectedHunksChange([])
    }
    // only when proposal identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposed])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button,textarea,input,a,label')) return
      drag.current = { ox: e.clientX, oy: e.clientY, sx: pos.x, sy: pos.y }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [pos.x, pos.y],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.ox
    const dy = e.clientY - drag.current.oy
    setPos({
      x: Math.max(8, drag.current.sx + dx),
      y: Math.max(8, drag.current.sy + dy),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    drag.current = null
  }, [])

  function toggleHunk(i: number) {
    if (selectedHunks.includes(i)) {
      onSelectedHunksChange(selectedHunks.filter((x) => x !== i))
    } else {
      onSelectedHunksChange([...selectedHunks, i].sort((a, b) => a - b))
    }
  }

  if (minimized) {
    return (
      <button
        type="button"
        className="fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg"
        style={{ right: 20, bottom: 20 }}
        onClick={() => setMinimized(false)}
        aria-label="Open coach chat"
        title="Coach"
      >
        ✦
      </button>
    )
  }

  const nSel = selectedHunks.length

  return (
    <div
      className="fixed z-40 flex w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-xl"
      style={{ left: pos.x, top: pos.y, maxHeight: 'min(70vh, 32rem)' }}
      role="dialog"
      aria-label="Resume coach"
    >
      <div
        className="flex cursor-grab items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="font-display text-sm font-semibold">Coach</span>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-line)]"
          onClick={() => setMinimized(true)}
          aria-label="Minimize coach"
          title="Minimize"
        >
          —
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <label className="label text-[10px]" htmlFor="coach-jd">
          Job description (optional)
        </label>
        <textarea
          id="coach-jd"
          className="input h-14 resize-y text-[11px]"
          placeholder="Paste JD to ground advice…"
          maxLength={4000}
          value={jd}
          onChange={(e) => onJdChange(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          {COACH_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="btn btn-primary w-full py-1 text-[11px]"
              disabled={coaching}
              onClick={() => onAction(a.id)}
            >
              {coaching ? 'Working…' : a.label}
            </button>
          ))}
        </div>
        {!chatReply && !proposed && (
          <p className="text-[10px] leading-snug text-[var(--color-muted)]">
            Score first for better advice. Fixed actions only — coach proposes hunks you approve.
            Select individual diffs in the editor strip or below.
          </p>
        )}
        {chatReply && (
          <div className="max-h-24 overflow-y-auto rounded bg-[var(--color-panel-2)] p-1.5 text-[10px] leading-snug text-[var(--color-soft)]">
            {chatReply}
          </div>
        )}
        {proposed?.hunks?.length ? (
          <div
            className="rounded border border-[var(--color-warn)] bg-[color-mix(in_srgb,var(--color-warn)_8%,transparent)] p-1.5"
            role="region"
            aria-label="Proposed edits"
            data-hunk-select="coach"
          >
            <p className="text-[10px] font-medium text-[var(--color-warn)]">
              Proposed · {proposed.section} · {nSel}/{proposed.hunks.length} selected
            </p>
            <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-[10px]">
              {proposed.hunks.map((h, i) => {
                const on = selectedHunks.includes(i)
                return (
                  <li key={i} className="rounded bg-[var(--color-panel)] p-1 font-mono">
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
                        onClick={() => onFocusHunk?.(i)}
                        title="Highlight in editor"
                      >
                        <div className="text-[var(--color-danger)]">− {h.find.slice(0, 120)}</div>
                        <div className="text-[var(--color-accent)]">+ {h.replace.slice(0, 120)}</div>
                      </button>
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onApplySelected}
                className="btn btn-warn py-0.5 text-[10px]"
                disabled={nSel === 0}
                data-apply-selected
              >
                Apply selected ({nSel})
              </button>
              <button type="button" onClick={onApplyAll} className="btn btn-secondary py-0.5 text-[10px]">
                Apply all
              </button>
              <button type="button" className="btn btn-secondary py-0.5 text-[10px]" onClick={onDismiss}>
                Dismiss
              </button>
              {hasUndoSrc && onUndoSrc && (
                <button type="button" className="btn btn-secondary py-0.5 text-[10px]" onClick={onUndoSrc}>
                  Undo src
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
