# Design: Full Scaffold + Stubs (MVP Shell)

**Status**: Approved (conversation 2026-07-21)  
**PRD**: `PRD.md` v1.1  
**Slice**: Full scaffold with stub implementations for every module — no real tectonic / Ollama / hiring-agent / GitHub OAuth yet.

---

## 1. Goal

Ship a runnable local monorepo where a user can:

1. Register / log in (email + password + JWT)
2. Create multiple resumes (LaTeX or structured track)
3. Hit compile / extract / score / chat / apply-edit endpoints that return stub results
4. Use a React shell covering auth, resume list, dual editor placeholders, score progress stepper, and chat propose→diff→approve UI

Success criterion for this slice: full loop with stubs, zero external paid services.

---

## 2. Architecture

Single repo, two apps, domain modules as replaceable packages (folder + protocol + stub):

```
resumeai/
  backend/
    app/
      main.py
      config.py
      db.py
      models/
      auth/
      resumes/
      compile/
      extract/
      scoring/
      chat/
      github/
      jobs/
      storage/
    tests/
    requirements.txt
  frontend/
    src/
      pages/
      api/
      components/
    package.json
  data/                 # gitignored runtime
  docs/
  PRD.md
  README.md
```

**Approach chosen:** backend/ + frontend/ monorepo (not uv workspaces, not backend-only). Modular via Python protocols and thin routers; swap stubs later without rewriting routes.

---

## 3. Locked Tech Stack (from PRD)

| Layer | Choice |
|-------|--------|
| Backend | FastAPI + Python |
| Frontend | React + Vite + TypeScript + Tailwind |
| DB | SQLite + SQLModel |
| Auth | Email + password + JWT |
| LLM | Ollama (stubbed this slice) |
| Files | Local filesystem under `data/` |
| Jobs | FastAPI BackgroundTasks + in-memory store |
| LaTeX | tectonic (stubbed this slice) |

**Constraints:** Modules independently replaceable. Ponytail: minimum code, no speculative abstractions beyond one protocol per replaceable domain.

---

## 4. Data Model

### User
- `id: str` (UUID)
- `email: str` (unique)
- `password_hash: str`
- `created_at: datetime`

### Resume
- `id: str` (UUID)
- `user_id: str` (FK)
- `title: str`
- `track: "latex" | "structured"`
- `latex_path: str | null` — path under `data/` for Track A
- `structured_json: dict | null` — JSON-Resume-shaped for Track B
- `template_id: str | null` — template key for structured track
- `created_at`, `updated_at: datetime`

### ScoreJob
- `id: str` (UUID)
- `resume_id: str` (FK)
- `user_id: str` (FK)
- `status: "queued" | "processing" | "complete" | "failed"`
- `result_json: dict | null` — PRD scoring output shape when complete
- `error: str | null`
- `created_at`, `updated_at: datetime`

No separate chat-message persistence in this slice (request/response only).

---

## 5. Module Contracts

Each domain: **Protocol** + **Stub** + **router** (where HTTP is needed).

### auth
- Register, login, `GET /auth/me`
- Passwords: stdlib-friendly hash (e.g. `hashlib.pbkdf2_hmac` or passlib if already chosen in deps — prefer one dependency only if needed; bcrypt via passlib is fine for trust boundary)
- JWT: HS256, secret from env/`config`, short-lived access token

### resumes
- Multi-resume CRUD scoped to current user
- Create with track; optional initial latex body or structured_json
- Patch updates title / latex content / structured fields / template_id

### storage
- Resolve `data/users/{user_id}/resumes/{resume_id}/...`
- Read/write text and binary paths; create dirs on demand

### compile (`LatexCompiler`)
- `compile(source_tex: str | path, out_dir) -> CompileResult`
- Stub: writes a placeholder PDF or returns message that tectonic is not wired

### extract (`DocxPdfExtractor`)
- `extract(path) -> dict` JSON-Resume-shaped
- Stub: empty skeleton object with standard keys (basics, work, education, skills, projects)

### scoring (`ScoreEngine`)
- `start_score(resume_id, content snapshot) -> job_id`
- Async: queued → processing → complete with fixed sample matching PRD minimum output shape
- Re-score is always explicit `POST` (never auto after apply-edit)

### chat (`Coach`)
- Input: resume content + optional latest score JSON + JD + user message
- Stub: canned advice referencing score categories + one `proposed_edit` payload
- Apply path is separate endpoint (explicit user approval)

### github (`GitHubClient`)
- Stub: empty enrichment profile; scoring works without it

### jobs
- In-memory or SQLite-backed job rows (ScoreJob in DB preferred so status survives process inspect)
- BackgroundTasks flips status and fills result_json

---

## 6. API Surface

All resume/job routes require JWT.

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/auth/register` | create user |
| POST | `/auth/login` | JWT |
| GET | `/auth/me` | current user |
| GET | `/resumes` | list mine |
| POST | `/resumes` | create |
| GET | `/resumes/{id}` | get |
| PATCH | `/resumes/{id}` | update |
| DELETE | `/resumes/{id}` | delete |
| POST | `/resumes/{id}/compile` | stub compile |
| POST | `/resumes/{id}/extract` | stub extract → may update structured_json |
| POST | `/resumes/{id}/score` | enqueue score job |
| GET | `/jobs/{job_id}` | job status + result |
| POST | `/resumes/{id}/chat` | stub coach reply |
| POST | `/resumes/{id}/apply-edit` | apply approved edit to latex or structured |

### Score result shape (stub must match)

```json
{
  "job_id": "string",
  "status": "complete",
  "overall_score": 0,
  "categories": [
    {
      "name": "technical_skills",
      "score": 0,
      "evidence": "string",
      "deductions": [],
      "suggestions": [
        {
          "section": "projects.entry_2",
          "suggestion": "string",
          "priority": "high",
          "expected_impact": "string"
        }
      ]
    }
  ],
  "jd_match": {
    "provided": false,
    "matched_keywords": [],
    "missing_keywords": [],
    "relevance_score": 0
  }
}
```

### Chat request/response (minimal)

**Request:** `{ "message": str, "job_description": str | null }`  
**Response:** `{ "reply": str, "proposed_edit": { "section": str, "before": str, "after": str } | null }`

**Apply-edit request:** `{ "section": str, "after": str }` — updates stored resume content for that section (latex whole-file replace if section is `latex`, else structured path).

---

## 7. Frontend Shell

- Vite + React + TS + Tailwind
- Pages: Login, Register, ResumeList, ResumeEditor (track-aware shell), Score, (chat panel can live on editor or score page)
- `api/` thin fetch helpers with JWT from localStorage
- Components: App layout, auth guard, ProgressStepper (queued/processing/complete/failed)
- Editors: LaTeX = textarea; Structured = simple field list over JSON keys — not production-quality forms

No real PDF viewer required; show compile stub message / download link if stub writes a file.

---

## 8. Explicit Non-Goals (this slice)

- Real tectonic / latexmk
- Real Ollama calls
- Real hiring-agent integration
- GitHub OAuth or scraping
- Real PDF/DOCX parsing
- Real LaTeX template catalog
- Subscriptions / multi-resume limits enforcement beyond “multi-resume works”
- Cloud hosting design

---

## 9. Testing (scaffold minimum)

- Backend: one pytest path for register → create resume → score job reaches complete with PRD keys; one for apply-edit mutates content
- Frontend: no E2E required this slice; manual smoke via dev servers

---

## 10. Implementation Order (for plan)

1. Backend skeleton (config, db, models, main)
2. Auth
3. Storage + resumes CRUD
4. Jobs + scoring stub
5. Compile / extract / github / chat stubs + apply-edit
6. Frontend scaffold + auth + resume list
7. Editor shells + score stepper + chat UI
8. README run instructions

---

## 11. Open Items (deferred to later slices / PRD §8)

- Chatbot interaction model depth (hybrid later)
- Default Ollama model
- Exact template set
- Pluggable scoring metrics UX
- Hosting
`}