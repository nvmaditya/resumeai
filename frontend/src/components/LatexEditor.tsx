import { useEffect, useRef } from 'react'
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  keymap,
  highlightActiveLine,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { useTheme } from '../theme'
import type { HunkRange } from '../lib/hunks'

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
      '.cm-hunk-selected': {
        backgroundColor: light ? 'rgba(217, 119, 6, 0.28)' : 'rgba(245, 158, 11, 0.32)',
        outline: light ? '1px solid rgba(217, 119, 6, 0.55)' : '1px solid rgba(245, 158, 11, 0.5)',
      },
      '.cm-hunk-dim': {
        backgroundColor: light ? 'rgba(100, 116, 139, 0.18)' : 'rgba(100, 116, 139, 0.28)',
        outline: '1px dashed rgba(100, 116, 139, 0.45)',
      },
    },
    { dark: !light },
  )
}

const setHunkMarks = StateEffect.define<HunkRange[]>()

const hunkMarkField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setHunkMarks)) {
        const builder = new RangeSetBuilder<Decoration>()
        const sorted = [...e.value].sort((a, b) => a.from - b.from)
        for (const r of sorted) {
          if (r.to <= r.from) continue
          const mark = Decoration.mark({
            class: r.selected ? 'cm-hunk-selected' : 'cm-hunk-dim',
          })
          builder.add(r.from, r.to, mark)
        }
        return builder.finish()
      }
    }
    if (tr.docChanged) {
      return value.map(tr.changes)
    }
    return value
  },
  provide: (f) => EditorView.decorations.from(f),
})

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
  /** Ranges for coach proposed finds (in-editor diff highlights). */
  hunkMarks?: HunkRange[]
}

export function LatexEditor({ value, onChange, editorRef, hunkMarks }: Props) {
  const { theme } = useTheme()
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeComp = useRef(new Compartment())
  const hlComp = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialTheme =
    (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || theme

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
          hunkMarkField,
          hlComp.current.of(syntaxHighlighting(highlightFor(initialTheme))),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          themeComp.current.of(editorTheme(initialTheme)),
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

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setHunkMarks.of(hunkMarks || []) })
  }, [hunkMarks])

  return (
    <div
      ref={host}
      className="h-full min-h-0 w-full overflow-hidden"
      style={{ background: 'var(--editor-bg)' }}
      data-editor-hunk-marks={hunkMarks?.length ? '1' : '0'}
    />
  )
}
