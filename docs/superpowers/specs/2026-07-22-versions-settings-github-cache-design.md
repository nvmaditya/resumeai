# Plan: Undo/Redo, Latex commits, User settings, GitHub score cache

**Date:** 2026-07-22  
**Mode:** ponytail full + superpowers brainstorming  
**Status:** design for approval  

---

## Scope (4 features, one slice in phases)

| # | Feature | Goal |
|---|---------|------|
| A | Undo / Redo buttons | UI buttons drive CodeMirror history (already installed) |
| B | Latex version commits | “Commit” + message → optimized snapshots; list/restore |
| C | Settings / profile | Basic user details (name, github, links) for profiling + GH cache identity |
| D | GitHub cache for scoring | No GitHub API during score; only on **Update GitHub data**; JD-aware repo pick from cache |

**User lock-in:** GitHub cache hangs off **user settings `github_username`** (not per-resume). Scoring should use **JD when present** and still do **top-repo selection** (from **cached** repos — no live GitHub).

---

## Context (what exists today)

- **CodeMirror** already has `history` + `historyKeymap` (Ctrl+Z) — no stack to reinvent; wire UI buttons to `undo`/`redo`.
- **User** model: `id, email, password_hash, created_at` only. `GET /auth/me` returns those.
- **Score** (`HiringAgentScoreEngine`): every run calls vendor `fetch_and_display_github_info` → many GitHub API hits (repos + contributors). Vendor file cache under `backend/cache/` only when `DEVELOPMENT_MODE` — not user-controlled, races with CWD.
- **Score API** does **not** accept JD today; `jd_match` is stub-empty.
- **Storage seam:** `LocalObjectStore` keys — use for version blobs + github snapshot (no absolute paths in DB).
- **ObjectStore / JobRunner / ScoreEngine** seams stay replaceable.

---

## Recommended design (ponytail)

### A — Undo / Redo

- Expose on `LatexEditorHandle`: `undo()`, `redo()`, `canUndo?` (optional).
- Dispatch CodeMirror `undo` / `redo` commands from `@codemirror/commands`.
- Buttons in editor toolbar (ResumeEditor). No server involvement.
- **Skip:** custom undo stack, structured-form undo (add later if needed).

### B — Version commits (optimized)

**API (per resume, owned):**

| Method | Path | Body / notes |
|--------|------|----------------|
| `POST` | `/resumes/{id}/versions` | `{ "message": str }` — snapshot **current** latex body |
| `GET` | `/resumes/{id}/versions` | list `{ id, message, created_at, sha256, size }` newest first |
| `POST` | `/resumes/{id}/versions/{vid}/restore` | set latex to that snapshot; returns `ResumeOut` |

**Storage (optimized):**

- Blob key: `users/{uid}/resumes/{rid}/versions/{vid}.tex`
- Index key: `users/{uid}/resumes/{rid}/versions/index.json`
- Store **content-addressed skip**: if `sha256(latex)` equals latest version → **400 or 200 no-op** with “unchanged” (prefer 200 `{ "unchanged": true }`).
- Cap **N=30** versions: drop oldest blobs when over cap.
- Message max 200 chars, sanitized.

**UI:** Commit button + message input next to Save; small versions dropdown “Restore”.

**Skip:** full git, diffs UI, structured-track versions (latex-only first).

### C — Settings / profile

**User columns (or one JSON field):** ponytail prefers **one** `profile_json` JSON column on `User`:

```json
{
  "display_name": "",
  "github_username": "",
  "linkedin_url": "",
  "portfolio_url": "",
  "headline": ""
}
```

| Method | Path |
|--------|------|
| `GET` | `/auth/me` — extend with `profile` |
| `PATCH` | `/auth/me` — `{ profile: { ...partial } }` |

**UI:** `/settings` page from nav “Settings”; form for those fields.

SQLite/SQLModel: add nullable `profile_json` column; `create_all` may not migrate existing DBs — use simple `ALTER` on startup or document delete `app.db` for local MVP. Prefer **startup ensure-column** helper if easy, else recreate note.

### D — GitHub cache + JD-aware score (latency)

#### Snapshot shape (object store)

Key: `users/{uid}/github/snapshot.json`

```json
{
  "username": "nvmaditya",
  "fetched_at": "ISO-8601",
  "profile": { ... },
  "repos": [ { "name", "url", "description", "stars", "language", "project_type", ... } ],
  "raw": { ... optional full vendor payload ... }
}
```

#### Update GitHub data (network **only** here)

`POST /auth/me/github/refresh` (or `/me/github/update`):

1. Require `profile.github_username` (or body override once).
2. Call vendor fetch **once** (profile + all public repos + whatever vendor already does). Prefer wrapping vendor `fetch_and_display_github_info` but **write result into our object store**, not process CWD `cache/`.
3. Store snapshot; return `{ username, fetched_at, repo_count, ok }`.
4. Optional: set `GITHUB_TOKEN` in env for higher rate limits (document only).

#### Score path (no GitHub HTTP)

`POST /resumes/{id}/score` body optional:

```json
{ "job_description": "..." }  // same sanitize as coach, max 4k
```

Engine:

1. Build resume text as today.
2. Load user github snapshot from object store (by `user_id` on job).
3. If missing → score **without** github enrich; flag `github_enriched: false`, `github_cache: "missing"` (do **not** auto-fetch).
4. If present:
   - **JD present:** select top ~5 repos from **cached** `repos` only (keyword overlap with JD + stars, or thin LLM call on **local cache JSON** — **no GitHub API**). Prefer **stdlib keyword score first** (ponytail); LLM selection only if keyword path too weak and Ollama already available.
   - **No JD:** use cached top projects if vendor payload already has selection, else top by stars from cache.
5. Append `convert_github_data_to_text`-equivalent from **selected subset** of cache.
6. If JD present: append fenced JD to evaluation text and fill `jd_match` with simple keyword hit/miss against resume+github text (honest light match — not a second full LLM unless free).

**UI:** Settings shows last `fetched_at` + “Update GitHub data” button; editor score uses current JD textarea already on page (pass to score API).

**Skip:** per-resume github override; mutating vendor `github.py` permanently (wrap from our engine); auto-refresh on score.

---

## Approaches considered

| Area | Options | Choice |
|------|---------|--------|
| Undo | Custom stack vs CM history | **CM history buttons** |
| Versions | Full git / DB rows / object store + index | **Object store + index + hash skip + cap 30** |
| Profile | Many columns vs `profile_json` | **`profile_json`** |
| GH cache | Vendor DEVELOPMENT_MODE files vs user object key | **User object-store snapshot + explicit refresh** |
| Top repos + JD | Live GitHub every score vs select from cache | **Select from cache; JD on score** |

---

## Phases (implement in order)

### Phase 1 — Undo/Redo UI
- LatexEditor: `undo`/`redo` on handle
- Buttons in editor chrome
- Smoke: manual + no new backend tests required

### Phase 2 — Latex versions
- Index + blob storage helpers
- 3 API routes
- UI commit + restore list
- Tests: commit → list → restore; unchanged skip; ownership 404

### Phase 3 — Settings / profile
- `profile_json` on User; GET/PATCH me
- Settings page + nav link
- Tests: patch profile round-trip

### Phase 4 — GitHub snapshot + score no-network
- Refresh endpoint → store snapshot (uses vendor fetch once)
- Score engine: load cache only; never call fetch on score
- Score accepts optional `job_description`; JD keyword/`jd_match`; top-repos from cache
- Frontend: pass JD on score; Settings “Update GitHub data”
- Tests: score with mock snapshot, no network; missing cache scores without GH; refresh unit with mocked fetch

### Phase 5 — Polish
- Done gate `verify_before_done.py`
- README/AGENTS note; skill touch if needed
- Tag when shipping (e.g. `v0.6.0`)

---

## Data flow (score after this work)

```
[Update GitHub] → GitHub API once → users/{uid}/github/snapshot.json

[Score + optional JD]
  resume latex → text
  + load snapshot (no HTTP)
  + if JD: pick top repos from snapshot
  + LLM evaluate (Ollama/hiring-agent)
  → job result (github_enriched from cache, faster)
```

```
[Commit message] → if hash new → versions/{id}.tex + index
[Undo/Redo] → CodeMirror only
```

---

## Files (expected touch set — fewest)

| Area | Files |
|------|--------|
| Models/schemas | `entities.py`, `schemas/api.py` |
| Auth/settings | `auth/router.py` |
| Versions | `resumes/router.py` or small `resumes/versions.py` |
| Score | `scoring/engine.py`, score route body |
| GH | thin `github/cache.py` (load/save/refresh wrap) |
| FE | `LatexEditor.tsx`, `ResumeEditor.tsx`, new `Settings.tsx`, `App.tsx` routes, `Layout.tsx` |
| Tests | `test_versions.py`, `test_profile.py`, `test_github_cache_score.py` |

---

## Success criteria

1. Undo/Redo buttons work without losing editor state.
2. Commit with message creates version only when content changes; restore works; cap enforced.
3. Settings persists basic profile including `github_username`.
4. Score does **zero** GitHub HTTP when cache present; missing cache does not call GitHub either.
5. “Update GitHub data” is the only path that hits GitHub.
6. Score with JD uses JD for repo selection / match fields from **cache**.
7. `scripts/verify_before_done.py` green.

---

## Out of scope

- Free-form coach chat  
- Multi-user GitHub or OAuth GitHub login  
- Real-time collab versions  
- Auto re-score after commit  
- Structured-resume versioning  

---

## Risks

| Risk | Mitigation |
|------|------------|
| Existing SQLite DB lacks `profile_json` | Startup migrate or clear local `data/app.db` |
| Vendor fetch still slow on Update | Accept once; token env for rate limit |
| Top-repo LLM on every score | Keyword-first from cache; optional LLM later |
| Version disk growth | Cap 30 + hash skip |

---

## Next

On approval: implement Phase 1→5; durable spec copy to `docs/superpowers/specs/2026-07-22-versions-settings-github-cache-design.md`; done gate each phase.
