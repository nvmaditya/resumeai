from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid4())


class User(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=_utcnow)


class Resume(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    user_id: str = Field(index=True, foreign_key="user.id")
    title: str = "Untitled Resume"
    track: str = "latex"  # latex | structured
    latex_key: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    template_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class ScoreJob(SQLModel, table=True):
    id: str = Field(default_factory=_uuid, primary_key=True)
    resume_id: str = Field(index=True, foreign_key="resume.id")
    user_id: str = Field(index=True, foreign_key="user.id")
    status: str = "queued"  # queued | processing | complete | failed
    result_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
