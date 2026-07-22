# Plan: Coach diffs, score-aware prompts, native PDF, drop SyncTeX

**Date:** 2026-07-22  
**Mode:** ponytail full + superpowers brainstorming  
**Status:** design ready for approval → then implement phases  

---

## User decisions (locked)

| Decision | Choice |
|----------|--------|
| SyncTeX | **Remove** entirely |
| PDF preview | **Browser default** (`iframe` + blob URL), drop pdf.js |
| Coach edits | **Find/replace hunks** only — accept → apply → recompile → preview |
| Hallucination | **Strictly forbidden** — no invent metrics/jobs/links/OSS |
| Score awareness | Coach prompts distilled from **hiring-agent** rubric + last score JSON |
| LLM providers | `stub` \| `ollama` \| `openrouter` \| **`groq`** (not Grok) |
| Delivery | **Phased**; hooks/tests run every phase; done gate before “done” |

---

## How hiring-agent scoring works (coach must target this)

Vendored: `backend/vendor/hiring-agent/`. ResumeAI runs text (+ optional GitHub `=== GITHUB DATA ===`) through LLM templates:

- `resume_evaluation_system_message.jinja`
- `resume_evaluation_criteria.jinja`

| Category | Max | Raises score | Hurts score |
|----------|-----|--------------|-------------|
| `open_source` | 35 | Contribs to **other** projects, GSoC, multi-contributor | Personal-only GitHub, tutorial repos |
| `self_projects` | 30 | Complex systems, architecture, adoption | CRUD/tutorials; **missing/broken links** |
| `production` | 25 | Internships, real work, founder/early eng | Empty work |
| `technical_skills` | 10 | Skills evidenced in projects/work | Bare skill lists |
| Bonus | ≤20 | Portfolio, LinkedIn, blogs, GSoC, founder | — |

**Coach rule:** Many gaps need **real-world evidence** → put in `reply` only. Hunks may only rephrase/restructure **existing** claims and links already in the source.

---

## Target flow

```
Coach action → POST /chat
  → { reply, proposed_edit: { section, hunks: [{find, replace}] } }
UI shows reply + diff hunks → Accept
  → POST /apply-edit { section, hunks }
  → apply unique find→replace → validate LaTeX structure → store
Client recompile → GET pdf?inline=1 → <iframe src=blobUrl>
```

---

## Approaches considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. Find/replace hunks (chosen)** | Easy for small models; no patch lib; easy 400s | Needs unique `find` strings |
| B. Unified diff | Familiar format | Fragile parse; bad with gemma-size models |
| C. Full-doc rewrite (current) | Simple schema | Breaks structure; hard to review; invents more |

**Providers (chosen):** one `LlmCoach` + thin `chat_completion`; Ollama native `/api/chat`; OpenRouter + Groq via OpenAI-compatible `/chat/completions`.

---

## Phases (implement in order)

### Phase 1 — Delete SyncTeX + native PDF
- Delete `backend/app/compile/synctex.py`, routes `synctex/edit|view`, `tests/test_synctex.py`
- Stop `\synctex=1` injection / `synctex` flags in compile (update tests that assert them)
- Replace `PdfPreview` with `<iframe src={blobUrl}>`; remove `pdfjs-dist` if unused
- Strip SyncTeX from `ResumeEditor`, `LatexEditor`
- Update skill/docs mentions
- **Exit:** `verify_before_done.py` green; manual compile shows PDF in iframe

### Phase 2 — Hunk apply-edit (E2E)
- Schema: `Hunk {find, replace}`; `ProposedEdit.hunks`; `ApplyEditRequest.hunks`
- `apply_hunks()`: each find must occur **exactly once** else 400; then `validate_latex_apply`
- Stub coach returns valid hunks
- Tests: `test_apply_edit.py` (happy + missing find + ambiguous + structure break); fix `test_loop`
- Frontend: render hunks as −/+, Accept sends hunks, recompile on success (keep revert-on-compile-fail)
- **Exit:** done gate green

### Phase 3 — Score-aware coach prompts
- Static rubric cheat-sheet constant (distilled from hiring-agent templates)
- Rewrite system/user prompts + `COACH_ACTIONS` for hunks + no invent
- Parse JSON `hunks`; empty/invalid → clear reply, no silent full rewrite
- **Exit:** unit or stub path proves score-grounded hunk shape

### Phase 4 — OpenRouter + Groq
- Env: `COACH_BACKEND`, `COACH_MODEL`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, base URL defaults
- Shared OpenAI-compatible HTTP client for openrouter/groq
- `.env.example` only (no secrets)
- **Exit:** offline tests with stub; optional live smoke if keys present

### Phase 5 — Skill + ship
- Rewrite `.grok/skills/resume-latex/SKILL.md`
- README/AGENTS touch if needed
- Tag only if user wants (e.g. `v0.5.0`)

---

## Config

```
COACH_BACKEND=ollama|openrouter|groq|stub
COACH_MODEL=...
OPENROUTER_API_KEY=
GROQ_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
GROQ_BASE_URL=https://api.groq.com/openai/v1
```

Scoring stays on existing hiring-agent path (not re-plumbed this slice).

---

## Hooks & tests (every phase)

```powershell
backend\.venv\Scripts\python.exe scripts\verify_before_done.py
# pre-commit (fast): pytest + compile sample
backend\.venv\Scripts\python.exe scripts\install_hooks.py
```

| New/updated tests | Phase |
|-------------------|-------|
| Drop/adjust synctex assertions | 1 |
| `test_apply_edit.py`, loop uses hunks | 2 |
| Prompt/hunk parse smoke | 3 |
| Provider factory selects backend (no live key required) | 4 |

---

## Files likely touched (ponytail: delete > add)

**Delete:** `synctex.py`, `test_synctex.py`, pdf.js usage  
**Backend:** `router.py`, `tectonic.py`, `schemas/api.py`, `chat/*`, `config.py`, `latex_validate.py` (maybe small)  
**Frontend:** `PdfPreview.tsx`, `ResumeEditor.tsx`, `LatexEditor.tsx`, `package.json`  
**Docs/skill:** `resume-latex/SKILL.md`, README/AGENTS as needed  
**After approval:** also write durable spec under `docs/superpowers/specs/2026-07-22-coach-diff-pdf-design.md` + implementation plan

---

## Success criteria

1. No SyncTeX paths remain  
2. PDF = browser native viewer only  
3. Coach → hunks; apply-edit E2E tested; no invented facts in prompts  
4. Rubric-aware coaching  
5. Ollama / OpenRouter / Groq via env  
6. Done gate green  

---

## Out of scope

Free-form chat · inventing resume content · auto re-score · Grok/xAI · rewriting hiring-agent vendor templates  

---

## Next after you approve this plan

1. Exit plan mode → implement Phase 1…5  
2. Commit durable design doc to `docs/superpowers/specs/`  
3. Run done gate each phase; final commit/tag per AGENTS.md when you ask to push  
