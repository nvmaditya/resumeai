import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export type PdfClickPos = {
  page: number
  /** SyncTeX: top-left origin, big points (72 dpi) */
  x: number
  y: number
  ctrlKey: boolean
}

export type PdfHighlight = {
  page: number
  x: number
  y: number
  width?: number
  height?: number
}

type Props = {
  data: ArrayBuffer | null
  busy?: boolean
  highlight?: PdfHighlight | null
  onCtrlClick?: (pos: PdfClickPos) => void
}

export function PdfPreview({ data, busy, highlight, onCtrlClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [err, setErr] = useState('')
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 })
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null)
  const viewportRef = useRef<pdfjs.PageViewport | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setErr('')
      pdfRef.current = null
      setNumPages(0)
      if (!data) return
      try {
        const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise
        if (cancelled) return
        pdfRef.current = doc
        setNumPages(doc.numPages)
        setPage(1)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'PDF load failed')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [data])

  useEffect(() => {
    if (highlight?.page && highlight.page !== page) {
      setPage(highlight.page)
    }
  }, [highlight, page])

  useEffect(() => {
    let cancelled = false
    async function render() {
      const pdf = pdfRef.current
      const canvas = canvasRef.current
      if (!pdf || !canvas || page < 1 || page > pdf.numPages) return
      const p = await pdf.getPage(page)
      if (cancelled) return
      const viewport = p.getViewport({ scale })
      viewportRef.current = viewport
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.height = viewport.height
      canvas.width = viewport.width
      setPageSize({ w: viewport.width, h: viewport.height })
      await p.render({ canvasContext: ctx, viewport, canvas }).promise

      // forward-search highlight box
      if (highlight && highlight.page === page) {
        // SyncTeX y is from top; canvas y grows downward
        const pdfH = p.view[3] - p.view[1] // media box height in pt
        const sx = highlight.x * scale
        const sy = (pdfH - highlight.y) * scale
        const w = Math.max(24, (highlight.width || 40) * scale)
        const h = Math.max(12, (highlight.height || 14) * scale)
        ctx.save()
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.95)'
        ctx.fillStyle = 'rgba(255, 193, 7, 0.25)'
        ctx.lineWidth = 2
        ctx.fillRect(sx, sy - h, w, h)
        ctx.strokeRect(sx, sy - h, w, h)
        ctx.restore()
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [data, page, scale, numPages, highlight])

  function onCanvasClick(ev: React.MouseEvent<HTMLCanvasElement>) {
    if (!ev.ctrlKey && !ev.metaKey) return
    const canvas = canvasRef.current
    const pdf = pdfRef.current
    const viewport = viewportRef.current
    if (!canvas || !pdf || !viewport) return
    const rect = canvas.getBoundingClientRect()
    const cssX = ev.clientX - rect.left
    const cssY = ev.clientY - rect.top
    // convert to PDF user space (origin bottom-left, points)
    const [pdfX, pdfY] = viewport.convertToPdfPoint(cssX, cssY)
    // SyncTeX wants top-left origin in bp
    void pdf.getPage(page).then((p) => {
      const pdfH = p.view[3] - p.view[1]
      const synctexY = pdfH - pdfY
      onCtrlClick?.({
        page,
        x: pdfX,
        y: synctexY,
        ctrlKey: true,
      })
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#525659]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/20 bg-[#3a3d40] px-2 py-1 text-xs text-white">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span className="tabular-nums">
            {page}/{numPages || '—'}
          </span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-40"
            disabled={!numPages || page >= numPages}
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
          >
            −
          </button>
          <span className="tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
            onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}
          >
            +
          </button>
        </div>
        <span className="text-[10px] text-white/50">Ctrl+Click → source</span>
        {busy && <span className="text-amber-300">Updating…</span>}
      </div>
      <div ref={wrapRef} className="min-h-0 flex-1 overflow-auto p-4">
        {err && <p className="text-center text-sm text-red-300">{err}</p>}
        {!data && !err && (
          <p className="text-center text-sm text-white/60">{busy ? 'Rendering…' : 'Compile to preview'}</p>
        )}
        <div className="relative mx-auto w-fit shadow-xl" style={{ width: pageSize.w || undefined }}>
          <canvas
            ref={canvasRef}
            className="block cursor-crosshair bg-white"
            onClick={onCanvasClick}
            title="Ctrl+Click for SyncTeX inverse search"
          />
        </div>
      </div>
    </div>
  )
}
