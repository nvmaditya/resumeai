import { useEffect, useMemo } from 'react'

type Props = {
  data: ArrayBuffer | null
  busy?: boolean
}

/** Browser-native PDF viewer via blob URL + iframe (no pdf.js). */
export function PdfPreview({ data, busy }: Props) {
  const url = useMemo(() => {
    if (!data) return null
    return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'application/pdf' }))
  }, [data])

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ background: 'var(--pdf-chrome-bg)' }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-2 py-1 text-[10px]"
        style={{ color: 'var(--pdf-chrome-fg)' }}
      >
        <span>PDF preview</span>
        {busy && <span className="text-[var(--color-warn)]">Updating…</span>}
      </div>
      <div className="min-h-0 flex-1 bg-[var(--color-panel)]">
        {!data && (
          <p className="p-4 text-center text-sm text-[var(--color-muted)]">
            {busy ? 'Rendering…' : 'Compile to preview'}
          </p>
        )}
        {url && (
          <iframe
            title="PDF preview"
            src={url}
            className="h-full w-full border-0 bg-[var(--color-panel)]"
          />
        )}
      </div>
    </div>
  )
}
