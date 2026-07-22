const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function token(): string | null {
  return localStorage.getItem('token')
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem('token', t)
  else localStorage.removeItem('token')
}

export async function api<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  }
  const t = token()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`${API}/api/v1${path}`, { ...opts, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function fetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {}
  const t = token()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`${API}/api/v1${path}`, { headers })
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
  return res.blob()
}

/** Authenticated binary download (e.g. compiled PDF). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await fetchBlob(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Object URL for inline PDF preview; caller must revoke. */
export async function fetchPdfObjectUrl(path: string): Promise<string> {
  const blob = await fetchBlob(path)
  return URL.createObjectURL(blob)
}

export async function fetchPdfBytes(path: string): Promise<ArrayBuffer> {
  const blob = await fetchBlob(path)
  return blob.arrayBuffer()
}

export type UserProfile = {
  display_name: string
  github_username: string
  linkedin_url: string
  portfolio_url: string
  headline: string
}
export type User = {
  id: string
  email: string
  created_at?: string
  profile?: UserProfile
}
export type LatexVersion = {
  id: string
  message: string
  created_at: string
  sha256: string
  size: number
}
export type Resume = {
  id: string
  title: string
  track: string
  latex_body?: string | null
  structured_json?: Record<string, unknown> | null
  template_id?: string | null
}
export type Job = {
  id: string
  resume_id: string
  status: string
  result_json?: {
    overall_score?: number
    categories?: Array<{
      name: string
      score: number
      evidence: string
      deductions: string[]
      suggestions: Array<{ section: string; suggestion: string; priority: string }>
    }>
    jd_match?: Record<string, unknown>
  } | null
  error?: string | null
}
