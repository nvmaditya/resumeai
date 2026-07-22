import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { useTheme } from '../theme'

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

function highlightFor(theme: 'light' | 'dark') {
  const isLight = theme === 'light'
  return HighlightStyle.define([
    {
      tag: tags.comment,
      color: isLight ? '#64748b' : '#6a9955',
      fontStyle: 'italic',
    },
    { tag: tags.keyword, color: isLight ? '#0369a1' : '#569cd6' },
    { tag: tags.bracket, color: isLight ? '#b45309' : '#ffd700' },
    { tag: tags.string, color: isLight ? '#b45309' : '#ce9178' },
  ])
}

function editorTheme(theme: 'light' | 'dark') {
  const light = theme === 'light'
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: light ? '#f8fafc' : '#1e1e1e',
        color: light ? '#0f172a' : '#d4d4d4',
      },
      '.cm-scroller': {
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        overflow: 'auto',
      },
      '.cm-gutters': {
        backgroundColor: light ? '#f1f5f9' : '#1e1e1e',
        color: light ? '#94a3b8' : '#858585',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: light ? '#e2e8f0' : '#2a2a2a',
      },
      '.cm-activeLine': {
        backgroundColor: light ? '#e2e8f0' : '#2a2d2e',
      },
      '.cm-content': {
        caretColor: light ? '#0f172a' : '#aeafad',
      },
    },
    { dark: !light },
  )
}

export type LatexEditorHandle = {
  highlightRange: (from: number, to: number) => void
  findAndHighlight: (query: string) => boolean
  goToLine: (line: number, column?: number) => void
  getCursor: () => { line: number; column: number }
  getValue: () => string
  undo: () => void
  redo: () => void
}

type Props = {
  value: string
  onChange: (v: string) => void
  editorRef?: React.MutableRefObject<LatexEditorHandle | null>
}

export function LatexEditor({ value, onChange, editorRef }: Props) {
  const { theme } = useTheme()
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeComp = useRef(new Compartment())
  const hlComp = useRef(new Compartment())
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
          hlComp.current.of(syntaxHighlighting(highlightFor(theme))),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          themeComp.current.of(editorTheme(theme)),
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
      undo: () => {
        undo(view)
      },
      redo: () => {
        redo(view)
      },
    }

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
    view.dispatch({
      effects: [
        themeComp.current.reconfigure(editorTheme(theme)),
        hlComp.current.reconfigure(syntaxHighlighting(highlightFor(theme))),
      ],
    })
  }, [theme])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur !== value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
    }
  }, [value])

  return (
    <div
      ref={host}
      className="h-full min-h-0 w-full overflow-hidden"
      style={{ background: 'var(--editor-bg)' }}
    />
  )
}
