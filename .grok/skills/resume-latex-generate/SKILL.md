---
name: resume-latex-generate
description: >
  Instructions for AI form→LaTeX resume generation and lint/compile repair loops.
  Used by backend generate agent (LangGraph tools). Trigger: form generate, AI resume builder.
---

# LaTeX resume generation skill

## Goal
Turn structured resume JSON (basics, work, education, skills, projects, publications, awards, certifications) into a **compilable** full LaTeX document.

## Output rules
1. Emit a complete document: `\documentclass` … `\begin{document}` … `\end{document}`.
2. Prefer `article` + `geometry` + `hyperref` + `enumitem`; avoid exotic packages tectonic may lack.
3. Escape special TeX chars in user text: `\& \% \$ \# \_ \{ \}`.
4. **Never invent** employers, metrics, degrees, links, or dates not present in the form JSON.
5. Omit empty sections entirely.
6. Header: name + available contact (email, phone, location, linkedin, github, website).
7. ATS-friendly: clear section headings, bullet lists with `\begin{itemize}`, no multi-column tricks that break text extraction.

## Repair loop
When lint/compile fails:
- Fix missing `\documentclass` / document env.
- Balance `\begin{...}` / `\end{...}` and braces.
- Remove unknown commands introduced by mistake.
- Keep user facts; only change TeX structure.

## Stop
Success = static lint clean of **errors** and compile produces a PDF starting with `%PDF`.
Max iterations bounded by the agent (do not loop forever).
