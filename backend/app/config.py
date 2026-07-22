from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    database_url: str = "sqlite:///./data/app.db"
    jwt_secret: str = "dev-only-change-me"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173"
    data_dir: str = "./data"
    score_backend: str = "hiring_agent"  # hiring_agent | stub
    hiring_agent_path: str = str(Path(__file__).resolve().parents[1] / "vendor" / "hiring-agent")
    # Optional absolute path to tectonic.exe; else backend/bin/tectonic.exe then PATH
    tectonic_path: str = ""
    coach_backend: str = "ollama"  # ollama | openrouter | groq | stub
    coach_model: str = ""  # empty → backend default / ollama_model
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "gemma3:4b"
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Freeze data_dir to absolute path at first load (process CWD must not matter later)
    p = Path(s.data_dir)
    if not p.is_absolute():
        s.data_dir = str((Path.cwd() / p).resolve())
    else:
        s.data_dir = str(p.resolve())
    return s
