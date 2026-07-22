# ResumeAI

Local-first AI resume optimization SaaS shell (SaaS-ready seams). FastAPI + React, SQLite, JWT, stub engines, vendored [HackerRank hiring-agent](https://github.com/interviewstreet/hiring-agent).

## Quick start

One shot (two windows):

```powershell
.\start.ps1
```

### Compile-quality hook (sample LaTeX → PDF text check)

Compiles `backend/tests/fixtures/ai_eng_resume.tex` via the real compiler, extracts PDF text, fails if raw LaTeX headers remain (`\documentclass`, `\begin{document}`, etc.):

```powershell
backend\.venv\Scripts\python.exe scripts\check_compile_sample.py
# install as git pre-commit:
backend\.venv\Scripts\python.exe scripts\install_hooks.py
```

### Backend (Python 3.12+)

```powershell
cd backend
# Prefer Python 3.12 if WDAC blocks other uv Pythons on Windows
uv venv .venv --python 3.12
uv pip install -r requirements.txt --python .venv\Scripts\python.exe
$env:PYTHONPATH = (Get-Location).Path
$env:JWT_SECRET = "dev-only-change-me"
$env:DATA_DIR = "./data"
$env:DATABASE_URL = "sqlite:///./data/app.db"
$env:CORS_ORIGINS = "http://localhost:5173"
$env:SCORE_BACKEND = "stub"   # or hiring_agent
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

API: `http://localhost:8000/api/v1/health`

Tests:

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -m pytest tests/test_loop.py -v
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — register → create resume → score → chat → apply edit → re-score.

Workspace (desktop): **1/5** actions · **2/5** editor · **2/5** PDF preview.

## Tectonic (Overleaf-like PDFs)

Drop the binary at:

```
backend/bin/tectonic.exe
```

Or set `TECTONIC_PATH` to any path. Without it, a simple layout fallback is used (fonts/margins will **not** match Overleaf).

Download: https://github.com/tectonic-typesetting/tectonic/releases

## hiring-agent

Vendored at `backend/vendor/hiring-agent` (MIT, interviewstreet).

- Default: `SCORE_BACKEND=stub` (no LLM required).
- Real scoring: install vendor deps, run Ollama, set `SCORE_BACKEND=hiring_agent`.

```powershell
uv pip install -r vendor/hiring-agent/requirements.txt --python .venv\Scripts\python.exe
# ollama pull gemma3:4b && ollama serve
$env:SCORE_BACKEND = "hiring_agent"
```

## Layout

```
backend/app/     FastAPI modules (auth, resumes, scoring, jobs, storage, …)
backend/vendor/  hiring-agent source
frontend/        React + Vite + Tailwind
docs/            design + plan
```

## SaaS seams (no rewrite later)

| Concern | Now | Later |
|--------|-----|--------|
| DB | `DATABASE_URL` SQLite | Postgres URL |
| Files | `LocalObjectStore` keys | S3 adapter |
| Jobs | `LocalJobRunner` + DB rows | Redis/worker |
| Score | stub / hiring-agent adapter | same API |
| Config | env / `.env.example` | platform secrets |

See `docs/superpowers/specs/2026-07-21-scaffold-stubs-design.md`.
