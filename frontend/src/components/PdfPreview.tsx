import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'

// Vite worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

type Props = {
  /** PDF as ArrayBuffer or blob URL */
  data: ArrayBuffer | null
  onTextClick?: (text: string) => void
  busy?: boolean
}

export function PdfPreview({ data, onTextClick, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.15)
  const [err, setErr] = useState('')
  const pdfRef = useRef<pdfjs.PDFDocumentProxy | null>(null)

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
    let cancelled = false
    async function render() {
      const pdf = pdfRef.current
      const canvas = canvasRef.current
      const textLayer = textLayerRef.current
      if (!pdf || !canvas || page < 1 || page > pdf.numPages) return
      const p = await pdf.getPage(page)
      if (cancelled) return
      const viewport = p.getViewport({ scale })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.height = viewport.height
      canvas.width = viewport.width
      await p.render({ canvasContext: ctx, viewport, canvas }).promise

      // Text layer for click-to-source
      if (textLayer) {
        textLayer.innerHTML = ''
        textLayer.style.width = `${viewport.width}px`
        textLayer.style.height = `${viewport.height}px`
        const textContent = await p.getTextContent()
        const frag = document.createDocumentFragment()
        for (const item of textContent.items) {
          if (!('str' in item) || !item.str) continue
          const tx = pdfjs.Util.transform(viewport.transform, item.transform)
          const span = document.createElement('span')
          span.textContent = item.str
          span.style.position = 'absolute'
          span.style.left = `${tx[4]}px`
          span.style.top = `${tx[5] - item.height * scale}px`
          span.style.fontSize = `${Math.max(8, item.height * scale)}px`
          span.style.fontFamily = 'sans-serif'
          span.style.color = 'transparent'
          span.style.cursor = 'pointer'
          span.style.whiteSpace = 'pre'
          span.title = item.str
          span.onclick = (ev) => {
            ev.preventDefault()
            onTextClick?.(item.str)
          }
          frag.appendChild(span)
        }
        textLayer.appendChild(frag)
      }
    }
    void render()
    return () => {
      cancelled = true
    }
  }, [data, page, scale, numPages, onTextClick])

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
        {busy && <span className="text-amber-300">Updating…</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {err && <p className="text-center text-sm text-red-300">{err}</p>}
        {!data && !err && (
          <p className="text-center text-sm text-white/60">
            {busy ? 'Rendering…' : 'Compile to preview'}
          </p>
        )}
        <div className="relative mx-auto w-fit shadow-xl">
          <canvas ref={canvasRef} className="block bg-white" />
          <div ref={textLayerRef} className="pointer-events-auto absolute left-0 top-0" />
        </div>
      </div>
    </div>
  )
}
