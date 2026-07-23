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


class UserProfile(BaseModel):
    display_name: str = ""
    github_username: str = ""
    linkedin_url: str = ""
    portfolio_url: str = ""
    headline: str = ""


class UserOut(BaseModel):
    id: str
    email: str
    created_at: datetime
    profile: UserProfile = Field(default_factory=UserProfile)


class UserUpdate(BaseModel):
    profile: Optional[UserProfile] = None


class ScoreRequest(BaseModel):
    job_description: Optional[str] = Field(default=None, max_length=4000)


class VersionCommitRequest(BaseModel):
    message: str = Field(default="", max_length=200)


class VersionOut(BaseModel):
    id: str
    message: str
    created_at: str
    sha256: str
    size: int


class ResumeCreate(BaseModel):
    title: str = "Untitled Resume"
    track: Literal["latex", "structured"] = "latex"
    latex_body: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None
    tags: Optional[list[str]] = None


class ResumeUpdate(BaseModel):
    title: Optional[str] = None
    latex_body: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None
    tags: Optional[list[str]] = None


class ResumeOut(BaseModel):
    id: str
    title: str
    track: str
    latex_key: Optional[str] = None
    latex_body: Optional[str] = None
    structured_json: Optional[dict[str, Any]] = None
    template_id: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TemplateOut(BaseModel):
    id: str
    title: str
    filename: str
    fields: list[str] = Field(default_factory=list)
    sections: list[str] = Field(default_factory=list)


class LintRequest(BaseModel):
    latex_body: Optional[str] = Field(default=None, max_length=500_000)
    compile: bool = True


class LintDiagnostic(BaseModel):
    line: Optional[int] = None
    severity: str
    message: str
    source: str


class LintResponse(BaseModel):
    diagnostics: list[LintDiagnostic]


class JobOut(BaseModel):
    id: str
    resume_id: str
    status: str
    result_json: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EditHunk(BaseModel):
    find: str
    replace: str


class ProposedEdit(BaseModel):
    section: str
    before: str = ""
    hunks: list[EditHunk] = Field(default_factory=list)


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
    hunks: list[EditHunk] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    """Optional structured override; else resume.structured_json is used."""

    structured_json: Optional[dict[str, Any]] = None
    title: Optional[str] = None


class GenerateResponse(BaseModel):
    latex_body: str
    status: str
    iterations: int
    diagnostics: list[dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    skill_loaded: bool = False
    used_llm: bool = False
