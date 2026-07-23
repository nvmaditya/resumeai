# ResumeAI

Local-first AI resume optimization app (SaaS-ready seams). **FastAPI + React**, SQLite, JWT, vendored [HackerRank hiring-agent](https://github.com/interviewstreet/hiring-agent) for scoring, fixed-action **coach** (find/replace hunks), **tectonic** PDF compile, browser-native preview.

**Repo:** https://github.com/nvmaditya/ResumeAI · **branch:** `main`

## Features (current)

| Area | What you get |
|------|----------------|
| **Create** | **New AI resume** (structured form → **AI Generate**) or **New LaTeX** (paste/edit). No user-facing template picker; `templates/` is internal skill reference only |
| **Workspace** | Two-tier chrome: identity + File \| Build \| Score \| Danger toolbar; rail (versions · diagnostics · score) · editor · PDF |
| **AI Generate** | Form JSON → skill-guided LLM seed → LangGraph lint/compile repair; `used_llm` honesty vs deterministic fallback |
| **Coach** | Fixed actions only; **per-hunk select**; diffs in **editor strip + CodeMirror highlights**; apply selected/all; no free-form chat |
| **Versions** | Commit checkpoints; scannable rows with restore + delete |
| **Compile** | Tectonic primary; layout PDF fallback if binary missing |
| **PDF** | Browser-native iframe preview (blob URL) — no pdf.js / SyncTeX |
| **Score** | `hiring_agent` or `stub`; GitHub data from user cache only |
| **Coach LLMs** | `ollama` · `openrouter` · `groq` · `stub` |
| **Settings** | Profile (name, GitHub username, links) + **Update GitHub data** |
| **Theme** | Light/dark with diagonal wipe; editor theme syncs on the same tick |
| **Editor** | CodeMirror LaTeX, Undo/Redo, Form \| Source tabs on AI path |

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

Flow: register → **Settings** (GitHub username → **Update GitHub data**) → **New AI resume** → fill form → **AI Generate** → **Compile** → **Score** → **Coach** → select hunks in editor → **Apply selected** → recompile. Or **New LaTeX** to paste your own `.tex`. **Commit** versions from the left rail.

Health: `GET http://127.0.0.1:8000/api/v1/health`  
(`score_backend`, `latex_engine`, `coach_backend`, `coach_model`)

### Done gate + hooks (agents / CI-style local check)

**Agents must update this README before every commit** (see `AGENTS.md`).

```powershell
backend\.venv\Scripts\python.exe scripts\verify_before_done.py
# → pytest + sample LaTeX compile check + frontend build
```

```powershell
backend\.venv\Scripts\python.exe scripts\check_compile_sample.py   # compile quality alone
backend\.venv\Scripts\python.exe scripts\install_hooks.py          # pre-commit: pytest + compile (--fast)
```

Lessons that needed a second ask live in **`LESSONS.md`** — append when you repeat a mistake.

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

Or set `TECTONIC_PATH`. Without it, a simple layout PDF engine still previews (not full TeX fidelity).

## License

MIT (see repo). Vendored hiring-agent is MIT.
