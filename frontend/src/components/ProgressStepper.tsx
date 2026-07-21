const STEPS = ['queued', 'processing', 'complete'] as const

export function ProgressStepper({ status }: { status: string }) {
  const failed = status === 'failed'
  const idx = failed ? -1 : Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number]))

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="status" aria-label={`Job status: ${status}`}>
      {STEPS.map((s, i) => {
        const done = !failed && i < idx
        const current = !failed && i === idx
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className={[
                'rounded-full px-2.5 py-1 font-medium capitalize transition-colors',
                current
                  ? 'bg-[var(--color-accent)] text-white shadow-[0_0_0_3px_rgba(16,185,129,0.2)]'
                  : done
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-[var(--color-panel-2)] text-[var(--color-muted)] border border-[var(--color-line)]',
              ].join(' ')}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-[var(--color-muted)]">→</span>}
          </div>
        )
      })}
      {failed && (
        <span className="rounded-full bg-rose-950 px-2.5 py-1 font-medium text-rose-300 border border-rose-800">
          failed
        </span>
      )}
    </div>
  )
}
