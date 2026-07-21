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
    score_backend: str = "stub"  # stub | hiring_agent
    hiring_agent_path: str = str(Path(__file__).resolve().parents[1] / "vendor" / "hiring-agent")
    # Optional absolute path to tectonic.exe; else backend/bin/tectonic.exe then PATH
    tectonic_path: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
