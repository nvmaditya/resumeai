# Design: SaaS-Ready Scaffold + Stubs (MVP Shell)

**Status**: Approved + implemented (scaffold slice, 2026-07-21)  
**PRD**: `PRD.md` v1.1  
**Slice**: Full scaffold with stub implementations — local defaults, **SaaS-shaped boundaries** so cloud migration is config + new adapters, not a rewrite.

---

## 1. Goal

Ship a runnable product shell that is **the same codebase** you will host as SaaS later.

Local now:

1. Register / log in (email + password + JWT)
2. Multi-resume CRUD (LaTeX + structured tracks)
3. Compile / extract / score / chat / apply-edit via **stub adapters**
4. React shell for the full loop

Later (without rewriting routes, models, or UI flows):

- SQLite → Postgres
- Local disk → object storage (S3/R2/etc.)
- In-process jobs → Redis/Celery/RQ/cloud queue
- Stub scoring → hiring-agent service
- Stub coach → Ollama or hosted LLM API
- Single machine → containerized API + static frontend + managed DB

**Success for this slice:** full stub loop locally **and** every infra concern goes through a narrow interface or env setting.

---

## 2. Architecture Principle: Local-backed, SaaS-shaped

```
┌─────────────┐     HTTPS/JSON      ┌──────────────────────────────┐
│  Frontend   │ ──────────────────► │  Stateless FastAPI           │
│  (static)   │                     │  thin routers only           │
└─────────────┘                     │         │                    │
                                    │    domain services           │
                                    │         │                    │
                                    │  ┌──────┴───────┐            │
                                    │  │  Protocols   │            │
                                    │  └──────┬───────┘            │
                                    │    adapters (swap)           │
                                    │  storage | jobs | score | …  │
                                    └──────────────────────────────┘
```

| Keep forever (product core) | Swap later (adapters only) |
|----------------------------|----------------------------|
| API routes & JSON contracts | `ObjectStore` impl |
| SQLModel entities & services | `DATABASE_URL` backend |
| Auth rules (JWT, password) | Secret store / token TTL |
| Score/chat/compile **protocols** | Real engines |
| Multi-user ownership checks | Deploy topology |

**Repo layout (still monorepo, not microservices):**

```
resumeai/
  backend/
    app/
      main.py                 # app factory, CORS, router mount, DI wiring
      config.py               # all settings from env (12-factor)
      db.py                   # engine from DATABASE_URL
      deps.py                 # FastAPI Depends → get_current_user, get_store, …
      models/                 # SQLModel tables
      schemas/                # Pydantic request/response DTOs (API contract)
      auth/
      resumes/
      compile/                # protocol + stub (+ later tectonic)
      extract/
      scoring/
      chat/
      github/
      jobs/                   # JobRunner protocol + local impl
      storage/                # ObjectStore protocol + local impl
    tests/
    requirements.txt
  frontend/
    src/
      pages/
      api/                    # base URL from VITE_API_URL only
      components/
    package.json
  data/                       # local ObjectStore root (gitignored); not used in SaaS
  docs/
  PRD.md
  README.md
  .env.example                # documents every setting; no secrets committed
```

Still **not** uv workspaces / microservices. SaaS readiness comes from **boundaries**, not from splitting repos. When you deploy: build frontend to static assets, run API as one or more workers, point env at managed services.

---

## 3. Tech Stack (now vs later)

| Layer | MVP (now) | SaaS later (no product rewrite) |
|-------|-----------|----------------------------------|
| Backend | FastAPI + Python | Same |
| Frontend | React + Vite + TS + Tailwind | Same build → CDN/static host |
| DB | SQLite via `DATABASE_URL` | Postgres via same `DATABASE_URL` |
| Auth | Email + password + JWT | Same; optional OAuth adapters later |
| LLM | Coach stub | Ollama or cloud API behind `Coach` |
| Files | `LocalObjectStore` under `data/` | `S3ObjectStore` (or R2, GCS) |
| Jobs | `LocalJobRunner` (BackgroundTasks + DB row) | Redis queue runner, same `JobRunner` API |
| LaTeX | Compile stub | Containerized tectonic worker behind `LatexCompiler` |
| Config | `.env` / process env | Platform secrets / env |

**Hard rules for this scaffold:**

1. **No raw filesystem paths in business logic** — only `ObjectStore` keys (e.g. `users/{user_id}/resumes/{resume_id}/main.tex`).
2. **No engine URL hardcoded** — `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `DATA_DIR`, etc. only via `config.py`.
3. **No in-memory-only job state as source of truth** — job status lives in DB (`ScoreJob`); runner is replaceable.
4. **Every query is tenant-scoped** — `user_id` from JWT; never trust client-supplied owner ids.
5. **API is stateless** — any instance can serve any request (sessions not in process memory).
6. **Frontend talks only to configured API origin** — `VITE_API_URL`; no hardcoded `localhost` in source (dev default in `.env` only).

Ponytail still applies: **one protocol per swap point**, one stub/local impl each. No factory frameworks, no plugin systems, no multi-cloud abstractions.

---

## 4. Data Model (SaaS-safe from day one)

### User
- `id: str` (UUID)
- `email: str` (unique, indexed)
- `password_hash: str`
- `created_at: datetime`
- *(reserved later, not built now: `plan`, billing ids — add when monetization ships)*

### Resume
- `id: str` (UUID)
- `user_id: str` (FK, indexed) — **ownership**
- `title: str`
- `track: "latex" | "structured"`
- `latex_key: str | null` — **object key**, not absolute path
- `structured_json: dict | null` — JSON-Resume-shaped (fine in SQLite JSON / Postgres JSONB)
- `template_id: str | null`
- `created_at`, `updated_at: datetime`

### ScoreJob
- `id: str` (UUID)
- `resume_id: str` (FK)
- `user_id: str` (FK, indexed) — for authz on `GET /jobs/{id}`
- `status: "queued" | "processing" | "complete" | "failed"`
- `result_json: dict | null`
- `error: str | null`
- `created_at`, `updated_at: datetime`

### Conventions
- UUID string PKs (portable, no serial surprises across DBs).
- All timestamps UTC.
- Soft multi-tenancy = row-level `user_id` (no org/team until product needs it).
- No chat history table this slice (add later without breaking coach protocol).

---

## 5. Config (12-factor)

All via environment / `.env.example`:

| Variable | Purpose | Local default |
|----------|---------|---------------|
| `DATABASE_URL` | SQLAlchemy/SQLModel URL | `sqlite:///./data/app.db` |
| `JWT_SECRET` | Sign tokens | dev-only default in example; **required** in prod |
| `JWT_EXPIRE_MINUTES` | Access token TTL | `10080` (week) or shorter |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173` |
| `DATA_DIR` | Root for `LocalObjectStore` | `./data` |
| `APP_ENV` | `local` \| `production` | `local` |
| `VITE_API_URL` | Frontend API base (build-time) | `http://localhost:8000` |

`config.py` is the only place that reads env. Adapters receive config via constructors in `main`/lifespan — not scattered `os.getenv`.

---

## 6. Module Contracts (protocols = SaaS seams)

Each domain: **Protocol** + **local/stub impl** + **thin router** using `Depends`.

### `ObjectStore` (storage/)
```text
put(key: str, data: bytes) -> None
get(key: str) -> bytes
delete(key: str) -> None
exists(key: str) -> bool
```
- **Now:** `LocalObjectStore(DATA_DIR)` — keys map to files under `data/`.
- **SaaS:** `S3ObjectStore(bucket, client)` — same keys.
- DB stores **keys only**.

### `JobRunner` (jobs/)
```text
enqueue(job_id: str, fn_name: str, payload: dict) -> None
```
- **Now:** FastAPI `BackgroundTasks` / `asyncio.create_task`; updates `ScoreJob` in DB.
- **SaaS:** publish to Redis/SQS; worker process runs same handler functions.
- Handlers are plain functions registered by name; status always written to DB so polling works across instances.

### `ScoreEngine` (scoring/)
- `run(snapshot: ScoreSnapshot) -> ScoreResult` matching PRD JSON shape.
- Stub returns fixed sample; real hiring-agent later.
- Router: create `ScoreJob` → enqueue → client polls `GET /jobs/{id}`.

### `Coach` (chat/)
- `advise(resume, score_json|None, jd|None, message) -> CoachReply`
- Stub canned; later Ollama/OpenAI-compatible client. Product never imports an LLM SDK in routers.

### `LatexCompiler` (compile/)
- `compile(tex_bytes: bytes) -> CompileResult` (pdf bytes or error).
- Stub placeholder PDF bytes; SaaS may run compiler in a worker container still behind this protocol.

### `DocxPdfExtractor` (extract/)
- `extract(file_bytes: bytes, content_type: str) -> dict`
- Stub empty JSON-Resume skeleton.

### `GitHubClient` (github/)
- Stub empty enrichment; OAuth tokens later stay in auth/github adapter, not in scoring core.

### auth
- Register / login / me.
- Password hash at trust boundary (e.g. PBKDF2 or bcrypt — pick one, document in plan).
- JWT only; no server-side session store (SaaS multi-instance friendly).
- Future OAuth = additional routes + link to same `User`, not a new app.

### resumes
- CRUD always filtered by `current_user.id`.
- 404 on cross-user access (no existence leak required; consistent 404 is fine).

### DI wiring (`deps.py` + app lifespan)
```text
app.state.store = LocalObjectStore(...)
app.state.jobs = LocalJobRunner(...)
app.state.score_engine = StubScoreEngine()
...
```
SaaS deploy flips constructors from env (e.g. `STORAGE_BACKEND=s3`) — **one place**, not scattered.

---

## 7. API Surface (stable product contract)

Version-ready prefix: **`/api/v1`** (avoids painful renames when public SaaS ships).

All resume/job routes require JWT.

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/v1/health` | liveness; no auth |
| POST | `/api/v1/auth/register` | create user |
| POST | `/api/v1/auth/login` | JWT |
| GET | `/api/v1/auth/me` | current user |
| GET/POST | `/api/v1/resumes` | list / create |
| GET/PATCH/DELETE | `/api/v1/resumes/{id}` | owned only |
| POST | `/api/v1/resumes/{id}/compile` | stub compile → store PDF key |
| POST | `/api/v1/resumes/{id}/extract` | stub extract |
| POST | `/api/v1/resumes/{id}/score` | enqueue job |
| GET | `/api/v1/jobs/{job_id}` | status + result (owned) |
| POST | `/api/v1/resumes/{id}/chat` | coach reply |
| POST | `/api/v1/resumes/{id}/apply-edit` | explicit apply |

### Score result shape (unchanged; PRD)

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

### Chat / apply-edit

**Chat request:** `{ "message": str, "job_description": str | null }`  
**Chat response:** `{ "reply": str, "proposed_edit": { "section": str, "before": str, "after": str } | null }`  
**Apply-edit:** `{ "section": str, "after": str }` — latex key `latex` replaces file bytes; else structured JSON path update.

Re-score is always manual (`POST .../score`), never auto after apply-edit.

---

## 8. Frontend Shell

- Vite + React + TS + Tailwind
- `VITE_API_URL` for all fetches; Authorization bearer from memory/localStorage
- Pages: Login, Register, ResumeList, ResumeEditor, Score (+ chat panel)
- ProgressStepper polls job endpoint (works with multi-instance API later)
- Editors: LaTeX textarea; structured simple fields
- CORS: backend allows configured origins only (local dev + future SaaS domain)

No assumption that frontend and API share a process or host.

---

## 9. Explicit Non-Goals (this slice)

**Do not build yet** (but design does not block them):

- Real tectonic / Ollama / hiring-agent / GitHub OAuth
- Real PDF/DOCX parsers, template catalog
- Stripe / plans / quotas
- Postgres, Redis, S3 wiring
- Docker/K8s manifests (optional later; not required for scaffold)
- Multi-region, SSO, orgs/teams

**Do build the seams** listed in §3 and §6 so those are adapter drops, not rewrites.

---

## 10. Migration map (so we do not “work again”)

| When you go SaaS | Change | Do not change |
|------------------|--------|---------------|
| Managed DB | `DATABASE_URL=postgresql+...` + migrate | Models, services, routes |
| Object storage | New `ObjectStore` impl + env | Keys in DB, resume logic |
| Horizontal API | More replicas, shared DB/store | JWT auth, routers |
| Background workers | New `JobRunner` + worker entrypoint | `ScoreJob` schema, poll API |
| Hosted LLM | New `Coach` impl | Chat request/response |
| Custom domain | `CORS_ORIGINS`, `VITE_API_URL` | Frontend page structure |
| Billing | New tables + middleware | Core resume/score flows |

---

## 11. Testing (scaffold minimum)

- Pytest: register → create resume → score job completes with PRD keys; apply-edit mutates content; **cross-user resume access returns 404**
- Config: app boots with env overrides (smoke)
- Frontend: manual smoke; API base from env

---

## 12. Implementation Order (for writing-plans)

1. Config + app factory + health + CORS + `.env.example`
2. DB models + session from `DATABASE_URL`
3. Auth (hash + JWT + me)
4. `ObjectStore` local + resumes CRUD (keys, tenant scope)
5. `JobRunner` local + scoring stub + poll
6. Compile / extract / github / chat stubs + apply-edit
7. Frontend scaffold + auth + list
8. Editor + score stepper + chat UI
9. README: local run + “SaaS swap” notes (env + adapters)

---

## 13. Open Items (product, not architecture)

- Chatbot UX depth (report / chat / hybrid)
- Default Ollama model
- Template set
- Pluggable metrics UX
- Concrete hosting vendor choice
- Subscription tiers

---

## 14. What changed vs prior approved design

1. Explicit **SaaS-shaped / local-backed** principle and migration map.
2. **`/api/v1`** prefix for stable public contract.
3. **`ObjectStore` + keys** instead of absolute paths in DB (`latex_key`).
4. **`JobRunner` protocol** + job rows in DB (not process-memory as truth).
5. **12-factor config** + `.env.example`; frontend `VITE_API_URL`.
6. **Stateless JWT**, CORS, tenant checks as first-class.
7. DI wiring called out as the single swap site for adapters.
8. Non-goals: still no cloud infra code; seams only.

This is the minimum extra structure that prevents a rewrite without building the cloud prematurely.
`}