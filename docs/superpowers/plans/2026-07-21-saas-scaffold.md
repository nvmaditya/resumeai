# SaaS-Ready Scaffold Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkboxes for tracking.

**Goal:** Runnable local monorepo (FastAPI + React) with SaaS seams, stubs, and vendored hiring-agent adapter.

**Architecture:** `/api/v1` stateless API; ObjectStore + JobRunner + ScoreEngine protocols; SQLite/local defaults.

**Tech Stack:** FastAPI, SQLModel, JWT, React/Vite/TS/Tailwind, vendor `backend/vendor/hiring-agent`.

## Global Constraints

- Ponytail: minimum code, one protocol per swap point
- Tenant-scoped queries; keys not absolute paths
- All config via env
- hiring-agent vendored; scoring uses stub by default, `SCORE_BACKEND=hiring_agent` when ready

### Tasks

1. Backend skeleton + auth + storage + resumes
2. Jobs + scoring (stub + hiring-agent adapter) + other stubs
3. Frontend shell
4. Tests + README + verify
`}