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
- Preview: browser-native PDF via blob URL + `<iframe>` (no pdf.js, no SyncTeX).
- Download: `GET /api/v1/resumes/{id}/pdf` attachment.
- Reject PDFs `<200` bytes or non-`%PDF` → recompile.

## Coach: score-aware find/replace hunks

- Fixed actions only: `improve_score`, `strengthen_projects`, `align_jd`, `quantify_impact`.
- Response: `{ reply, proposed_edit: { section, hunks: [{find, replace}] } }`.
- Apply: `POST .../apply-edit` with `hunks` — each `find` must be **unique** in the doc.
- **Never invent** employers, metrics, links, OSS, titles. Real-world gaps → `reply` only.
- Prompts include hiring-agent rubric (open_source / self_projects / production / technical_skills + link penalties).
- Providers: `COACH_BACKEND=ollama|openrouter|groq|stub` (+ keys for openrouter/groq).

### Hiring-agent score levers (for coaching)

| Category | Max | Coach can improve by… | Cannot invent |
|----------|-----|------------------------|---------------|
| open_source | 35 | clearer wording of real multi-repo work | fake GSoC / external contribs |
| self_projects | 30 | complexity wording; surface existing demo/GitHub URLs | fake users, stars, demos |
| production | 25 | ownership language already true in work bullets | fake jobs |
| technical_skills | 10 | skills already evidenced in body | skill stuffing |

## When editing LaTeX (agent rules)

1. Full docs: `\documentclass` … `\begin{document}` … `\end{document}`.
2. Prefer tectonic-friendly packages: geometry, enumitem, hyperref, fontenc, lmodern.
3. Margins via `geometry` (e.g. `margin=0.75in`).
4. Never invent absolute Windows paths inside `.tex`.
5. After hunk apply: recompile; verify `engine=tectonic` and PDF size > 1KB.
6. Visual quality: consistent sectioning, tight lists (`enumitem` nosep), hyperref for real links only.

## Scoring

- Default `SCORE_BACKEND=hiring_agent`. Stub is fake scores.
- Pipeline: resume text → GitHub URL → vendor evaluator LLM.

## Tests / done gate

```powershell
backend\.venv\Scripts\python.exe scripts\verify_before_done.py
```

## Do not

- Re-add SyncTeX or pdf.js unless product asks.
- Free-form chat from the client.
- Commit `backend/bin/tectonic.exe` or API keys.
