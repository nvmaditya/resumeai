
---

# PRD: AI Resume Optimization SaaS with ATS Scoring

**Status**: Final for MVP  
**Version**: 1.1 (post-grill)  
**Date**: 21 July 2026  
**Scope**: Full vision in v1. Everything described below is in scope. Monetization, hosting path, and plug-in metrics design remain open.

### 1. Problem & Product Summary

A local-first SaaS that lets software engineers:

1. Bring an existing resume (`.tex`, DOCX, PDF) or build one from a structured form.
2. Get it rendered through a LaTeX template system.
3. Score it with an extended version of HackerRank’s open-source `hiring-agent` (JD relevance + pluggable extra signals).
4. Receive deep, score-grounded AI advice on a specific job description, with the ability for the AI to propose edits that the user can approve and apply automatically.

Primary audience: software engineers / technical candidates (GitHub signal is a core part of the scoring model).

### 2. Scoring Engine Contract (Product-Facing Only)

The founder owns the internal extension of `hiring-agent`. The product only depends on this contract.

**Invocation**: Asynchronous job-based (progress stepper required).

**Minimum output shape**:
```json
{
  "job_id": "string",
  "status": "queued | processing | complete | failed",
  "overall_score": 0-100,
  "categories": [
    {
      "name": "technical_skills | open_source | self_projects | production | jd_relevance | ...",
      "score": 0-100,
      "evidence": "string",
      "deductions": ["string"],
      "suggestions": [
        {
          "section": "projects.entry_2",
          "suggestion": "string",
          "priority": "high | medium | low",
          "expected_impact": "string (optional)"
        }
      ]
    }
  ],
  "jd_match": {
    "provided": true,
    "matched_keywords": [],
    "missing_keywords": [],
    "relevance_score": 0-100
  }
}
```

Re-scoring is **always** a manual user action (“Re-check score” button). Never auto-triggered after AI edits.

### 3. Resume Tracks (Two Independent Paths)

**Track A – LaTeX**
- User uploads or pastes `.tex`
- AI-assisted code editor operates on raw LaTeX
- Can download both `.tex` and PDF
- Compiles via shared local LaTeX service

**Track B – Structured**
- User uploads PDF/DOCX or fills a form
- Extracted to JSON Resume-style schema
- User picks from a fixed set of platform LaTeX templates
- Editing happens only on structured fields
- User can download **PDF only** (underlying `.tex` is never exposed)

Both tracks use the same local compile service (`tectonic` preferred).

Multi-resume support is required (limits gated by future subscription tiers).

### 4. GitHub Enrichment

Both paths in v1:
- Optional GitHub OAuth (better rate limits)
- Fallback: parse any GitHub link/username from the resume and scrape the public profile

Scoring must work even if the user never connects GitHub.

### 5. AI Chatbot (JD-Aware Coach)

- Receives: current resume content + latest score JSON + job description
- Must ground advice in the scoring engine’s per-section suggestions and evidence
- Can propose concrete edits
- Edit flow: propose → show diff → user explicitly approves → editor state is updated
- Applies to both LaTeX and structured editors
- Interaction model (one-shot report vs conversational vs hybrid) is deliberately left open for implementation time

### 6. Locked Technical Decisions (Local-First MVP)

These override any earlier generic statements:

| Layer              | Choice                                      | Notes |
|--------------------|---------------------------------------------|-------|
| Backend            | FastAPI + Python                            |       |
| Frontend           | React + Vite + TypeScript + Tailwind        |       |
| Database           | SQLite + SQLModel                           | Pure local |
| Auth               | Email + password + JWT                      | Completely free, no external provider |
| LLM                | Ollama (local)                              |       |
| File storage       | Local filesystem                            |       |
| Background jobs    | FastAPI BackgroundTasks + asyncio queue     | No Redis/Celery required yet |
| LaTeX compile      | Local `tectonic` (or `latexmk`)             | Shared service for both tracks |
| Hosting            | Left open                                   | Do not design for cloud yet |

**Hard engineering constraints**
- Entire codebase must be modular (scoring, compile, extraction, each editor, chatbot, auth are independently replaceable).
- Apply **ponytail** discipline on every component: YAGNI, prefer stdlib / already-installed tools, write the absolute minimum code that works, mark any shortcuts with clear comments.

### 7. Core User Flows (v1)

**Flow A – Own LaTeX**  
Upload `.tex` → AI LaTeX editor → compile/preview → (optional) connect GitHub → Score (async progress) → view results → paste JD into chatbot → review/apply diffs → manually re-score → download `.tex` + PDF.

**Flow B – PDF/DOCX**  
Upload → structured extraction → review fields → pick template → compile/preview → same scoring + chatbot loop (editing happens in structured form) → download PDF only.

**Flow C – From scratch**  
Fill structured form → same as Flow B from template selection onward.

### 8. Explicitly Open Items

1. Chatbot interaction model (report / chat / hybrid)
2. Subscription tiers & pricing (including multi-resume limits)
3. Design of pluggable extra metrics (papers, patents, etc.) and their input UX
4. Hosting / scale path
5. Default Ollama model recommendations
6. Exact set of LaTeX templates

### 9. Success Criteria for MVP

A user on a single local machine can complete the full loop:
- Create account (email + password)
- Ingest a resume via any of the three methods
- Run a scoring job with live progress and receive the structured JSON result
- Paste a JD and receive grounded improvement suggestions
- Accept an AI-proposed edit that updates the editor
- Manually re-score and see the new numbers
- Download the final PDF (and `.tex` if on LaTeX track)

Zero external paid services required.

---