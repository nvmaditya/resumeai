import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const ToastCtx = createContext<{ push: (msg: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)

  const push = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 2800)
  }, [])

  const value = useMemo(() => ({ push }), [push])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast outside provider')
  return ctx
}
