from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.chat.ollama import build_coach
from app.compile.tectonic import build_compiler, resolve_tectonic
from app.config import get_settings
from app.db import init_db
from app.extract.stub import StubExtractor
from app.github.stub import StubGitHubClient
from app.jobs.local import LocalJobRunner
from app.jobs.router import router as jobs_router
from app.resumes.router import router as resumes_router
from app.scoring.engine import build_score_engine
from app.storage.local import LocalObjectStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    # Ensure sqlite parent exists for default URL
    if settings.database_url.startswith("sqlite:///./"):
        Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    init_db()
    app.state.store = LocalObjectStore(settings.data_dir)
    app.state.job_runner = LocalJobRunner()
    app.state.score_engine = build_score_engine(settings)
    app.state.compiler = build_compiler(settings.tectonic_path or None)
    app.state.latex_engine = "tectonic" if resolve_tectonic(settings.tectonic_path or None) else "layout"
    app.state.extractor = StubExtractor()
    app.state.coach = build_coach(
        backend=settings.coach_backend,
        ollama_base_url=settings.ollama_base_url,
        ollama_model=settings.ollama_model,
    )
    app.state.github = StubGitHubClient()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ResumeAI", version="0.3.1", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    api = "/api/v1"
    app.include_router(auth_router, prefix=api)
    app.include_router(resumes_router, prefix=api)
    app.include_router(jobs_router, prefix=api)

    @app.get(f"{api}/health")
    def health() -> dict:
        eng = "tectonic" if resolve_tectonic(settings.tectonic_path or None) else "layout"
        return {
            "status": "ok",
            "env": settings.app_env,
            "score_backend": settings.score_backend,
            "latex_engine": eng,
            "coach_backend": settings.coach_backend,
            "ollama_model": settings.ollama_model,
        }

    return app


app = create_app()
