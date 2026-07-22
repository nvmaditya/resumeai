---
name: resume-latex
description: >
  ResumeAI LaTeX/tectonic rules for compile, preview, and coach edits.
  Use when editing resumes, compile/PDF preview, tectonic, Overleaf parity,
  LaTeX templates, or /resume-latex. Invoke before changing compile paths
  or AI-proposed LaTeX edits.
---

# Resume LaTeX (ResumeAI)

## Engine

- **Primary:** `tectonic` at `backend/bin/tectonic.exe` (or `TECTONIC_PATH` / PATH).
- **Fallback:** `pdf_layout` only if tectonic missing/fails — **not** Overleaf-parity.
- Health: `GET /api/v1/health` → `latex_engine: tectonic|layout`.

## Workspace layout

Desktop: **1/5** actions/score/coach · **2/5** editor · **2/5** PDF preview.

## Compile contract

- Track **latex**: compile user `.tex` **as-is** (full TeX fidelity).
- Track **structured**: generate minimal article `.tex` then tectonic.
- Output stored as object key `users/{uid}/resumes/{rid}/out.pdf`.
- Preview: blob from `GET /api/v1/resumes/{id}/pdf?inline=1`.
- Download: same path without `inline` (attachment).
- Reject PDFs `<200` bytes or non-`%PDF` (old stubs) → recompile.

## When editing LaTeX (agent rules)

1. Prefer valid, self-contained docs: `\documentclass` … `\begin{document}` … `\end{document}`.
2. Prefer packages tectonic can fetch (geometry, enumitem, hyperref, fontenc, lmodern). Avoid exotic Overleaf-only fonts unless needed.
3. Keep margins via `geometry` (e.g. `margin=0.75in`) rather than inventing layout-engine paddings.
4. Never invent absolute Windows paths inside `.tex`.
5. AI coach edits: **fixed actions only** (`improve_score`, `strengthen_projects`, `align_jd`, `quantify_impact`). No free-form user prompt injection.
6. Proposed edits must return full replaceable body for section `latex` or `summary`.
7. After LaTeX changes: recompile with tectonic; verify `engine=tectonic` and PDF size > 1KB.

## Scoring

- Default `SCORE_BACKEND=hiring_agent` (not stub). Stub is instant fake scores.
- Pipeline: resume text → GitHub URL extract → `github.fetch_and_display_github_info` → LLM evaluate.
- Health must show `score_backend: hiring_agent` for real scoring.

## Coach + Ollama

- `COACH_BACKEND=ollama` (default), model `gemma3:4b` unless `OLLAMA_MODEL` set.
- Untrusted resume/JD always fenced (`<<<UNTRUSTED_*>>>`); strip injection phrases.
- Apply-edit rejects LaTeX that drops `\documentclass` / `\begin{document}` / `\end{document}`.
- If Ollama down: surface error in reply; do not crash the API.

## Editor / PDF UX

- CodeMirror LaTeX highlighting (not plain textarea).
- pdf.js canvas preview (not browser `<iframe>` PDF chrome).
- **SyncTeX** (official `synctex` CLI — do not hand-parse `.synctex.gz`):
  - Compile injects `\synctex=1`; work dir keeps `main.tex` / `main.pdf` / `main.synctex.gz`
  - Inverse: `POST .../synctex/edit` `{page,x,y}` → line/column (Ctrl+Click PDF)
  - Forward: `POST .../synctex/view` `{line,column}` → page/x/y (Ctrl+Click editor or Jump to PDF)
  - Requires `synctex` on PATH (MiKTeX/TeX Live)

## Tests to run after LaTeX/coach changes

```powershell
# Full done gate (required before claiming done — see AGENTS.md)
backend\.venv\Scripts\python.exe scripts\verify_before_done.py

# Targeted subset while iterating:
cd backend
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -m pytest tests/test_tectonic.py tests/test_pdf_layout.py tests/test_chat_safety.py -v
# live (needs ollama + API):
.\.venv\Scripts\python.exe tests/live_check.py
```

## Do not

- Re-tune Helvetica layout paddings to “look like Overleaf” instead of using tectonic.
- Allow free-form chat messages from the client.
- Commit `backend/bin/tectonic.exe`.
