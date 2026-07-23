---
name: resume-latex-generate
description: >
  Instructions for AI form→LaTeX resume generation and lint/compile repair loops.
  Used by backend generate agent (LangGraph tools). Trigger: form generate, AI resume builder.
  Structural lessons distilled from internal templates/ (classic-ats, technical, modern, executive, entry-level).
---

# LaTeX resume generation skill

## Goal
Turn structured resume JSON (basics, work, education, skills, projects, publications, awards, certifications) into a **compilable** full LaTeX document. User-facing product path is **form → AI generate**, not static template fill. Repo `templates/*.tex` are **internal layout references** only.

## Output rules
1. Emit a complete document: `\documentclass` … `\begin{document}` … `\end{document}`.
2. Prefer `article` + `geometry` + `hyperref` + `enumitem` (+ optional `titlesec`, `parskip`, `xcolor`); avoid exotic packages tectonic may lack. **fontawesome5** is optional (technical/entry-level used it)—prefer plain text contact separators if unsure.
3. Escape special TeX chars in user text: `\& \% \$ \# \_ \{ \}`.
4. **Never invent** employers, metrics, degrees, links, or dates not present in the form JSON.
5. Omit empty sections entirely.
6. Header: name + available contact (email, phone, location, linkedin, github, website).
7. ATS-friendly: clear section headings, bullet lists with `\begin{itemize}`, no multi-column tricks that break text extraction.

## Structural patterns (learned from internal templates)

### Document shell (classic-ats / modern / executive)
- `article` 11pt; margins ~0.5–0.75in; `\pagestyle{empty}`.
- Section style: bold (often uppercase or small-caps) + **horizontal rule under heading** (`\rule{\textwidth}{0.4–0.6pt}` or `titlesec` + `titlerule`).
- Body was historically injected at `% RESUMEAI:BODY` — generators emit the **full** document (no shell markers required).

### Contact / name block
- **Centered name** large bold; contact on one or two lines with `|` or `·` separators (classic-ats body style; technical used icon macros — prefer text for ATS).
- Include only fields present in form JSON.
- Email via `\href{mailto:...}{...}` when hyperref is loaded.

### Experience / projects / education entries
- Row pattern used across templates (`\entry` / `\jobheader` / `\experienceentry`):
  - Line 1: **Organization or title** `\hfill` dates
  - Line 2: *role or school* `\hfill` location (optional)
- Then `\begin{itemize}...\item ...\end{itemize}` for bullets from summary/highlights (split on newlines).
- Projects: **Name** `|` *stack/link* then bullets (technical `\projectheader` pattern).

### Section order (default, skip empty)
1. Header (name + contact)
2. Professional summary (if present)
3. Experience / work
4. Projects
5. Education
6. Skills (grouped keywords; modern used compact skill mboxes — simple comma or itemize is fine)
7. Publications / awards / certifications if present

### ATS-safe classic-ats lessons
- Avoid requiring `tabularx`, `tikz`, multi-col skill grids for the **default** generated path.
- Prefer single-column flow; rules under sections help visual scan without tables.

### Density
- entry-level: tighter margins (0.5in), compact lists (`nosep`, small `itemsep`).
- executive: slightly larger section spacing, navy/dark accent optional via `xcolor` — never invent content to fill space.

## Repair loop
When lint/compile fails:
- Fix missing `\documentclass` / document env.
- Balance `\begin{...}` / `\end{...}` and braces.
- Remove unknown commands introduced by mistake.
- Keep user facts; only change TeX structure.

## Stop
Success = static lint clean of **errors** and compile produces a PDF starting with `%PDF`.
Max iterations bounded by the agent (do not loop forever).
