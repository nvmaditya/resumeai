# ResumeAI

Local-first AI resume optimization app (SaaS-ready seams). **FastAPI + React**, SQLite, JWT, vendored [HackerRank hiring-agent](https://github.com/interviewstreet/hiring-agent) for scoring, fixed-action **coach** (find/replace hunks), **tectonic** PDF compile, browser-native preview.

**Repo:** https://github.com/nvmaditya/resumeai · **branch:** `main`

## Features (current)

| Area | What you get |
|------|----------------|
| **Workspace** | Desktop layout **1/5** actions · **2/5** LaTeX editor · **2/5** PDF preview |
| **Compile** | Tectonic primary; layout PDF fallback if binary missing |
| **PDF** | Browser-native iframe preview (blob URL) — no pdf.js / SyncTeX |
| **Score** | `hiring_agent` or `stub`; **GitHub data from user cache only** (no API on each score) |
| **Coach** | Fixed actions only; proposes **find/replace hunks**; no free-form chat; no invented facts |
| **Coach LLMs** | `ollama` · `openrouter` · `groq` · `stub` |
| **Versions** | Commit message snapshots of LaTeX (hash-skip, cap 30); restore from history list |
| **Settings** | Profile (name, GitHub username, links) + **Update GitHub data** |
| **Theme** | Light/dark with diagonal wipe; light + dark LaTeX editor and PDF chrome |
| **Editor** | CodeMirror LaTeX, Undo/Redo |

## Quick start

```powershell
# From repo root — two windows (backend has no --reload by design)
.\start.ps1
# Backend  http://127.0.0.1:8000
# Frontend http://127.0.0.1:5173
```

Copy env template and edit secrets locally (never commit `.env`):

```powershell
copy .env.example backend\.env
# Set GROQ_API_KEY / COACH_BACKEND=groq, or use ollama, etc.
```

Flow: register → **Settings** (GitHub username → **Update GitHub data**) → create resume → **Compile** → **Score** (optional JD) → **Coach** → review hunks → **Apply** → recompile → re-score. **Commit** versions from the Version history panel.

Health: `GET http://127.0.0.1:8000/api/v1/health`  
(`score_backend`, `latex_engine`, `coach_backend`, `coach_model`)

### Done gate + hooks (agents / CI-style local check)

```powershell
backend\.venv\Scripts\python.exe scripts\verify_before_done.py
# → pytest + sample LaTeX compile check + frontend build
```

```powershell
backend\.venv\Scripts\python.exe scripts\check_compile_sample.py   # compile quality alone
backend\.venv\Scripts\python.exe scripts\install_hooks.py          # pre-commit: pytest + compile (--fast)
```

## Backend (Python 3.12+)

```powershell
cd backend
uv venv .venv --python 3.12
uv pip install -r requirements.txt --python .venv\Scripts\python.exe
$env:PYTHONPATH = (Get-Location).Path
# Prefer backend\.env (see .env.example). Process env overrides .env.
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Do **not** use dual `--reload` workers for compile work (stale code risk). `start.ps1` runs without `--reload`.

Tests:

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -m pytest tests/ -q
```

### Important env (see `.env.example`)

| Variable | Notes |
|----------|--------|
| `SCORE_BACKEND` | `hiring_agent` (default in app) or `stub` |
| `COACH_BACKEND` | `ollama` \| `openrouter` \| `groq` \| `stub` |
| `COACH_MODEL` | e.g. `gemma3:4b` or `llama-3.3-70b-versatile` |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | For cloud coaches |
| `OLLAMA_*` | Local coach/scoring LLM |
| `TECTONIC_PATH` | Optional; else `backend/bin/tectonic.exe` |
| `JWT_SECRET`, `DATA_DIR`, `DATABASE_URL`, `CORS_ORIGINS` | App basics |

**Coach pitfall:** process `COACH_BACKEND=ollama` overrides `backend/.env`. A Groq model name with Ollama backend yields `404` on `:11434/api/chat`.

## Frontend

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## Tectonic (Overleaf-like PDFs)

```
backend/bin/tectonic.exe
```

Or set `TECTONIC_PATH`. Without it, layout fallback is used (not Overleaf-parity).

Download: https://github.com/tectonic-typesetting/tectonic/releases

## Scoring (hiring-agent)

Vendored at `backend/vendor/hiring-agent` (MIT).

- **Score does not call GitHub.** Cache via Settings → **Update GitHub data**.
- Optional **job description** on score: top-repo pick from cache + keyword `jd_match`.
- Real evaluator usually needs Ollama (or vendor LLM config) + vendor deps:

```powershell
uv pip install -r vendor/hiring-agent/requirements.txt --python .venv\Scripts\python.exe
# ollama pull gemma3:4b && ollama serve
```

Rubric categories (simplified): open_source, self_projects, production, technical_skills + bonus/deductions — see vendor templates and `backend/app/chat/rubric.py`.

## Coach

- Actions only: `improve_score`, `strengthen_projects`, `align_jd`, `quantify_impact`.
- Response: advice + `hunks: [{ find, replace }]` (unique substrings).
- Apply → validates full LaTeX structure → recompile.
- Untrusted resume/JD fenced; injection phrases filtered.

## Layout

```
backend/app/     FastAPI (auth, resumes, scoring, chat, compile, storage, …)
backend/vendor/  hiring-agent
frontend/        React + Vite + Tailwind + CodeMirror
docs/            design specs + plans
scripts/         verify_before_done, compile sample hook
.grok/skills/    resume-latex agent skill
```

## SaaS seams (no rewrite later)

| Concern | Now | Later |
|--------|-----|--------|
| DB | `DATABASE_URL` SQLite | Postgres URL |
| Files | `LocalObjectStore` keys | S3 adapter |
| Jobs | `LocalJobRunner` + DB rows | Redis/worker |
| Score | stub / hiring-agent adapter | same API |
| Config | env / `.env.example` | platform secrets |

## Releases (tags)

| Version | Summary |
|---------|---------|
| v0.1.0 | Scaffold + hiring-agent vendor + auth/resumes/score stubs |
| v0.2.0 | Light UI, structured form, safe coach, PDF layout + live preview |
| v0.3.0 | 1/5–2/5–2/5 workspace + tectonic Overleaf-parity compile |
| v0.4.0 | (intermediate product slices — see git tags) |
| v0.5.0 | Drop SyncTeX/pdf.js; coach hunks + rubric; openrouter/groq |
| v0.6.0 | Undo/redo, latex commits, settings, GitHub score cache |

## Agent / contributor notes

- Rules: `AGENTS.md`
- Specs: `docs/superpowers/specs/`
- Before claiming done: `scripts/verify_before_done.py`
- Do **not** commit: `.env`, `backend/data/`, `backend/cache/`, personal `resume/` samples, `.venv/`, `tectonic.exe`
