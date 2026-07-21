const STEPS = ['queued', 'processing', 'complete'] as const

export function ProgressStepper({ status }: { status: string }) {
  const failed = status === 'failed'
  const idx = failed ? -1 : Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number]))
  return (
    <div className="flex items-center gap-2 text-sm">
      {STEPS.map((s, i) => {
        const active = !failed && i <= idx
        return (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 ${
                active ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-slate-600">→</span>}
          </div>
        )
      })}
      {failed && (
        <span className="rounded-full bg-red-700 px-3 py-1 text-white">failed</span>
      )}
    </div>
  )
}
