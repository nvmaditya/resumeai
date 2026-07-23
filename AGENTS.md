# AGENTS.md — ResumeAI

Rules for coding agents working in this repository.

## Product constraints

- Local-first MVP, SaaS-shaped seams (`ObjectStore`, `JobRunner`, `ScoreEngine`, env config).
- Ponytail: minimum code; no new deps if stdlib/existing stack covers it.
- Trust boundaries: coach uses **fixed actions only** (no free-form user messages); sanitize JD/edits.
- PDF: prefer **tectonic** (`backend/bin/tectonic.exe` or `TECTONIC_PATH`); layout engine is fallback only.

## Git versioning & GitHub push (required)

Keep history **version-wise** so each meaningful slice is a tag + push.

### When to cut a version

| Change type | Version bump | Example tag |
|-------------|--------------|-------------|
| Scaffold / big feature slice | minor | `v0.2.0` |
| Bugfix / polish within slice | patch | `v0.2.1` |
| Breaking API/contract | minor until 1.0 | `v0.3.0` |

### Done gate (required — never claim done without this)

Before saying work is complete, fixed, or ready to ship, **run and pass**:

```powershell
# from repo root
backend\.venv\Scripts\python.exe scripts\verify_before_done.py
```

That script runs, in order:

| Step | What |
|------|------|
| 1 | `pytest tests/` (backend) |
| 2 | `scripts/check_compile_sample.py` (tectonic sample → no raw LaTeX in PDF) |
| 3 | `npm run build` (frontend) |

Pre-commit (faster; skips frontend build):

```powershell
backend\.venv\Scripts\python.exe scripts\install_hooks.py   # once per clone
# hook runs: verify_before_done.py --fast
```

**No completion claims without fresh exit code 0 from the full gate.**

### Agent checklist after implementable work

1. Pass the **done gate** above (`scripts/verify_before_done.py`).
2. Commit with conventional message (`feat:`, `fix:`, `docs:`, `chore:`).
3. Tag if this is a shippable slice:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z — short summary"
   ```
4. Push branch **and** tags:
   ```bash
   git push -u origin HEAD
   git push origin vX.Y.Z
   # or: git push origin --tags
   ```
5. Update this table when adding a release:

| Version | Summary |
|---------|---------|
| v0.1.0 | Scaffold + hiring-agent vendor + auth/resumes/score stubs |
| v0.2.0 | Light UI, structured form, safe coach, PDF layout + live preview |
| v0.3.0 | 1/5–2/5–2/5 workspace + tectonic Overleaf-parity compile |
| v0.5.0 | Drop SyncTeX/pdf.js; coach hunks + hiring-agent rubric; openrouter/groq |
| v0.6.0 | Undo/redo, latex commits, settings profile, GitHub score cache |
| v0.6.1 | .tex download, template SoT, API errors, UX polish (DESIGN) |
| v0.7.0 | Path split: paste LaTeX vs form-only templates + meta.json skill |

### Repo

- Remote: https://github.com/nvmaditya/resumeai
- Default branch: `main`
- Tags: `v0.1.0`, `v0.2.0`, `v0.3.0` (tectonic + 1/5 layout)
- Do **not** commit secrets, `.env`, `data/`, personal `resume/` samples, or `.venv/`.

## Dev commands

```powershell
# Backend (Python 3.12)
cd backend
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
```

## Modules (replaceable)

| Path | Role |
|------|------|
| `backend/app/compile/` | tectonic primary, layout fallback |
| `backend/bin/tectonic.exe` | Local TeX engine (gitignored binary) |
| `backend/app/scoring/` | stub or hiring-agent |
| `backend/app/chat/` | coach + injection safety |
| `backend/app/storage/` | LocalObjectStore → S3 later |
| `backend/vendor/hiring-agent` | vendored MIT scorer |

## Do not

- Free-form LLM chat from the client.
- Absolute filesystem paths in the DB (use object keys).
- Fake/invalid PDF stubs that open as corrupt.
