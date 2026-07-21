from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    created_at: datetime


class ResumeCreate(BaseModel):
    title: str = "Untitled Resume"
    track: Literal["latex", "structured"] = "latex"
    latex_body: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None


class ResumeUpdate(BaseModel):
    title: Optional[str] = None
    latex_body: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None


class ResumeOut(BaseModel):
    id: str
    title: str
    track: str
    latex_key: Optional[str] = None
    latex_body: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class JobOut(BaseModel):
    id: str
    resume_id: str
    status: str
    result_json: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProposedEdit(BaseModel):
    section: str
    before: str
    after: str


class ChatRequest(BaseModel):
    """Coach uses fixed actions only — no free-form user messages (injection surface)."""

    action: Literal[
        "improve_score",
        "strengthen_projects",
        "align_jd",
        "quantify_impact",
    ]
    job_description: Optional[str] = Field(default=None, max_length=4000)


class ChatResponse(BaseModel):
    reply: str
    proposed_edit: Optional[ProposedEdit] = None


class ApplyEditRequest(BaseModel):
    section: str
    after: str
