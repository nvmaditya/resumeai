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
    get_settings.cache_clear()
    settings = get_settings()
    data_root = Path(settings.data_dir).resolve()
    data_root.mkdir(parents=True, exist_ok=True)
    settings.data_dir = str(data_root)
    # Ensure sqlite parent exists for default URL
    if "sqlite" in settings.database_url:
        data_root.mkdir(parents=True, exist_ok=True)
    init_db()
    app.state.store = LocalObjectStore(data_root)
    app.state.data_dir = str(data_root)
    app.state.job_runner = LocalJobRunner()
    app.state.score_engine = build_score_engine(settings)
    app.state.compiler = build_compiler(settings.tectonic_path or None)
    app.state.latex_engine = "tectonic" if resolve_tectonic(settings.tectonic_path or None) else "layout"
    app.state.extractor = StubExtractor()
    # Default model per backend when COACH_MODEL empty
    coach_model = (settings.coach_model or "").strip()
    if not coach_model:
        if settings.coach_backend == "groq":
            coach_model = "llama-3.3-70b-versatile"
        elif settings.coach_backend == "openrouter":
            coach_model = "openai/gpt-4o-mini"
        else:
            coach_model = settings.ollama_model
    app.state.coach = build_coach(
        backend=settings.coach_backend,
        model=coach_model,
        ollama_base_url=settings.ollama_base_url,
        openrouter_api_key=settings.openrouter_api_key,
        openrouter_base_url=settings.openrouter_base_url,
        groq_api_key=settings.groq_api_key,
        groq_base_url=settings.groq_base_url,
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
            "coach_model": settings.coach_model or settings.ollama_model,
            "ollama_model": settings.ollama_model,
        }

    return app


app = create_app()
