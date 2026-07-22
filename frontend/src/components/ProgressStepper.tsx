const STEPS = ['queued', 'processing', 'complete'] as const

const LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing',
  complete: 'Complete',
  failed: 'Failed',
}

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
                'rounded-full px-2.5 py-1 font-medium transition-colors border',
                current
                  ? 'bg-[var(--color-accent)] text-white border-transparent shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_22%,transparent)]'
                  : done
                    ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-panel-2)] text-[var(--color-muted)] border-[var(--color-line)]',
              ].join(' ')}
            >
              {done ? '✓ ' : current ? '● ' : '○ '}
              {LABELS[s] || s}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-[var(--color-muted)]" aria-hidden>
                →
              </span>
            )}
          </div>
        )
      })}
      {failed && (
        <span className="rounded-full border border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] px-2.5 py-1 font-medium text-[var(--color-danger)]">
          ✕ Failed
        </span>
      )}
    </div>
  )
}
