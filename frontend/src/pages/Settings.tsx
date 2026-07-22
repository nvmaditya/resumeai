import { useEffect, useState } from 'react'
import { api, type User, type UserProfile } from '../api/client'
import { useToast } from '../toast'

const empty: UserProfile = {
  display_name: '',
  github_username: '',
  linkedin_url: '',
  portfolio_url: '',
  headline: '',
}

type Props = {
  onClose?: () => void
  onLogout?: () => void
  embedded?: boolean
}

export function Settings({ onClose, onLogout, embedded }: Props) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<UserProfile>(empty)
  const [gh, setGh] = useState<{
    cached: boolean
    username?: string | null
    fetched_at?: string | null
    repo_count?: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void (async () => {
      const me = await api<User>('/auth/me')
      setEmail(me.email)
      setProfile({ ...empty, ...(me.profile || {}) })
      try {
        setGh(await api('/auth/me/github'))
      } catch {
        setGh(null)
      }
    })()
  }, [])

  async function save() {
    setBusy(true)
    try {
      const me = await api<User>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ profile }),
      })
      setProfile({ ...empty, ...(me.profile || {}) })
      toast.push('Settings saved')
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function updateGithub() {
    setRefreshing(true)
    try {
      const out = await api<{ username: string; repo_count: number; fetched_at: string }>(
        '/auth/me/github/refresh',
        { method: 'POST', body: '{}' },
      )
      setGh({
        cached: true,
        username: out.username,
        repo_count: out.repo_count,
        fetched_at: out.fetched_at,
      })
      toast.push(`GitHub cached · ${out.repo_count} repos`)
    } catch (ex) {
      toast.push(ex instanceof Error ? ex.message : 'GitHub refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  function field(key: keyof UserProfile, label: string, placeholder = '') {
    return (
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--color-muted)]">{label}</span>
        <input
          className="input w-full"
          value={profile[key]}
          placeholder={placeholder}
          onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
        />
      </label>
    )
  }

  const body = (
    <div className="space-y-4">
      {!embedded && (
        <h1 className="font-display text-xl font-semibold text-[var(--color-text)]">Settings</h1>
      )}
      <p className="text-xs text-[var(--color-muted)]">Account: {email || '…'}</p>

      <div className="space-y-3 rounded border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        {field('display_name', 'Display name')}
        {field('headline', 'Headline', 'e.g. CS undergrad · AI systems')}
        {field('github_username', 'GitHub username', 'nvmaditya')}
        {field('linkedin_url', 'LinkedIn URL')}
        {field('portfolio_url', 'Portfolio URL')}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      <div className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <h2 className="text-sm font-semibold">GitHub data (for scoring)</h2>
        <p className="text-[11px] text-[var(--color-muted)]">
          Score uses this cache only — no GitHub API on each score. Update when your repos change.
        </p>
        {gh?.cached ? (
          <p className="text-xs text-[var(--color-soft)]">
            Cached @{gh.username} · {gh.repo_count ?? 0} repos
            {gh.fetched_at ? ` · ${new Date(gh.fetched_at).toLocaleString()}` : ''}
          </p>
        ) : (
          <p className="text-xs text-amber-700">No cache yet — set username and update.</p>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={refreshing || !profile.github_username.trim()}
          onClick={() => void updateGithub()}
        >
          {refreshing ? 'Updating…' : 'Update GitHub data'}
        </button>
      </div>

      {onLogout && (
        <div className="border-t border-[var(--color-line)] pt-4">
          <button type="button" className="btn btn-danger w-full" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  )

  if (!embedded) {
    return <div className="mx-auto max-w-lg space-y-4 p-4">{body}</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="font-display text-lg font-semibold">Settings</h2>
        {onClose && (
          <button
            type="button"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
    </div>
  )
}
