import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

const latexLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^%.*$/)) return 'comment'
    if (stream.match(/^\\[a-zA-Z@]+\*?/)) return 'keyword'
    if (stream.match(/^\\./)) return 'keyword'
    if (stream.match(/^[{}]/)) return 'bracket'
    if (stream.match(/^[$$$$]/)) return 'string'
    stream.next()
    return null
  },
})

const latexHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#569cd6' },
  { tag: tags.bracket, color: '#ffd700' },
  { tag: tags.string, color: '#ce9178' },
])

export type LatexEditorHandle = {
  highlightRange: (from: number, to: number) => void
  findAndHighlight: (query: string) => boolean
  /** 1-based line, 0-based column (SyncTeX) */
  goToLine: (line: number, column?: number) => void
  getCursor: () => { line: number; column: number }
  getValue: () => string
}

type Props = {
  value: string
  onChange: (v: string) => void
  editorRef?: React.MutableRefObject<LatexEditorHandle | null>
}

export function LatexEditor({ value, onChange, editorRef }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          latexLanguage,
          syntaxHighlighting(latexHighlight),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '13px',
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
            },
            '.cm-scroller': {
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              overflow: 'auto',
            },
            '.cm-gutters': {
              backgroundColor: '#1e1e1e',
              color: '#858585',
              border: 'none',
            },
            '.cm-activeLineGutter': { backgroundColor: '#2a2a2a' },
            '.cm-activeLine': { backgroundColor: '#2a2d2e' },
            '.cm-content': { caretColor: '#aeafad' },
          }),
          EditorView.lineWrapping,
        ],
      }),
    })
    viewRef.current = view

    const handle: LatexEditorHandle = {
      getValue: () => view.state.doc.toString(),
      getCursor: () => {
        const pos = view.state.selection.main.head
        const line = view.state.doc.lineAt(pos)
        return { line: line.number, column: pos - line.from }
      },
      goToLine: (line, column = 0) => {
        const doc = view.state.doc
        const ln = Math.max(1, Math.min(line, doc.lines))
        const lineObj = doc.line(ln)
        const col = Math.max(0, Math.min(column, lineObj.length))
        const pos = lineObj.from + col
        view.dispatch({
          selection: { anchor: pos, head: Math.min(pos + 1, lineObj.to) },
          scrollIntoView: true,
        })
        view.focus()
      },
      highlightRange: (from, to) => {
        const f = Math.max(0, Math.min(from, view.state.doc.length))
        const t = Math.max(f, Math.min(to, view.state.doc.length))
        view.dispatch({
          selection: { anchor: f, head: t },
          scrollIntoView: true,
        })
        view.focus()
      },
      findAndHighlight: (query) => {
        const needle = query.replace(/\s+/g, ' ').trim()
        if (needle.length < 2) return false
        const doc = view.state.doc.toString()
        const lower = doc.toLowerCase()
        for (const n of [needle, needle.slice(0, 60), needle.slice(0, 30), needle.slice(0, 16)]) {
          if (n.length < 2) continue
          const idx = lower.indexOf(n.toLowerCase())
          if (idx >= 0) {
            handle.highlightRange(idx, idx + n.length)
            return true
          }
        }
        return false
      },
    }

    // Ctrl/Cmd+Click in editor → forward search (custom event)
    view.dom.addEventListener('click', (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const cur = handle.getCursor()
      host.current?.dispatchEvent(
        new CustomEvent('synctex-forward', {
          bubbles: true,
          detail: { line: cur.line, column: cur.column },
        }),
      )
    })
    if (editorRef) editorRef.current = handle

    return () => {
      view.destroy()
      viewRef.current = null
      if (editorRef) editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur !== value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="h-full min-h-0 w-full overflow-hidden" />
}
