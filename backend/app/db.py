from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_settings = get_settings()
connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine = create_engine(_settings.database_url, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _ensure_sqlite_columns()


def _ensure_sqlite_columns() -> None:
    """Add columns for existing local SQLite DBs (create_all won't alter)."""
    if not str(engine.url).startswith("sqlite"):
        return
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(user)")).fetchall()
        cols = {r[1] for r in rows}
        if "profile_json" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN profile_json JSON"))
            conn.commit()
        rrows = conn.execute(text("PRAGMA table_info(resume)")).fetchall()
        rcols = {r[1] for r in rrows}
        if "tags" not in rcols:
            conn.execute(text("ALTER TABLE resume ADD COLUMN tags JSON"))
            conn.commit()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
