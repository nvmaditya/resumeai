from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_user, get_store
from app.models import Resume, ScoreJob, User
from app.latex_lint import lint_latex
from app.resumes.tags import normalize_tags
from app.schemas import (
    ApplyEditRequest,
    ChatRequest,
    ChatResponse,
    JobOut,
    LintRequest,
    LintResponse,
    ResumeCreate,
    ResumeOut,
    ResumeUpdate,
    ScoreRequest,
    TemplateOut,
    VersionCommitRequest,
    VersionOut,
)
from app.storage.protocol import ObjectStore
from app.templates_catalog import list_templates, load_template_body

router = APIRouter(prefix="/resumes", tags=["resumes"])
templates_router = APIRouter(prefix="/templates", tags=["templates"])


def _latex_key(user_id: str, resume_id: str) -> str:
    return f"users/{user_id}/resumes/{resume_id}/main.tex"


def _load_owned(session: Session, user: User, resume_id: str) -> Resume:
    resume = session.exec(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id)
    ).first()
    if not resume:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found")
    return resume


def _to_out(resume: Resume, store: ObjectStore) -> ResumeOut:
    body = None
    if resume.latex_key and store.exists(resume.latex_key):
        body = store.get(resume.latex_key).decode("utf-8", errors="replace")
    return ResumeOut(
        id=resume.id,
        title=resume.title,
        track=resume.track,
        latex_key=resume.latex_key,
        latex_body=body,
        structured_json=resume.structured_json,
        template_id=resume.template_id,
        tags=list(resume.tags or []),
        created_at=resume.created_at,
        updated_at=resume.updated_at,
    )


def _empty_structured() -> dict[str, Any]:
    return {
        "basics": {"name": "", "email": "", "summary": ""},
        "work": [],
        "education": [],
        "skills": [],
        "projects": [],
    }


@router.get("", response_model=list[ResumeOut])
def list_resumes(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> list[ResumeOut]:
    rows = session.exec(select(Resume).where(Resume.user_id == user.id)).all()
    return [_to_out(r, store) for r in rows]


@templates_router.get("", response_model=list[TemplateOut])
def get_templates(
    user: User = Depends(get_current_user),
) -> list[TemplateOut]:
    _ = user
    return [
        TemplateOut(id=t.id, title=t.title, filename=t.filename) for t in list_templates()
    ]


@router.post("", response_model=ResumeOut, status_code=status.HTTP_201_CREATED)
def create_resume(
    body: ResumeCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ResumeOut:
    tags = normalize_tags(body.tags)
    track = body.track
    latex_body = body.latex_body
    template_id = body.template_id
    structured = None

    if template_id:
        try:
            latex_body = load_template_body(template_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        track = "latex"
        if not body.title or body.title in ("Untitled Resume", "Structured resume"):
            # client may send generic title; keep if custom
            pass

    if track == "structured":
        structured = body.structured_json or _empty_structured()
    resume = Resume(
        user_id=user.id,
        title=body.title,
        track=track,
        structured_json=structured,
        template_id=template_id,
        tags=tags,
    )
    session.add(resume)
    session.commit()
    session.refresh(resume)

    if track == "latex":
        key = _latex_key(user.id, resume.id)
        store.put(key, (latex_body or "% Resume\n").encode("utf-8"))
        resume.latex_key = key
        resume.updated_at = datetime.now(timezone.utc)
        session.add(resume)
        session.commit()
        session.refresh(resume)

    return _to_out(resume, store)


@router.get("/{resume_id}", response_model=ResumeOut)
def get_resume(
    resume_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ResumeOut:
    return _to_out(_load_owned(session, user, resume_id), store)


@router.post("/{resume_id}/lint", response_model=LintResponse)
def lint_resume(
    resume_id: str,
    body: LintRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> LintResponse:
    resume = _load_owned(session, user, resume_id)
    source = body.latex_body
    if source is None:
        if resume.latex_key and store.exists(resume.latex_key):
            source = store.get(resume.latex_key).decode("utf-8", errors="replace")
        else:
            source = ""
    from app.compile.tectonic import resolve_tectonic

    settings = request.app.state  # type: ignore[attr-defined]
    # tectonic path from compiler binary if present
    binary = None
    if body.compile:
        compiler = getattr(settings, "compiler", None)
        bin_path = getattr(compiler, "binary", None)
        if bin_path is not None:
            binary = bin_path
        else:
            binary = resolve_tectonic()
    diags = lint_latex(source, run_compile=body.compile, tectonic_binary=binary)
    return LintResponse(
        diagnostics=[
            {
                "line": d.line,
                "severity": d.severity,
                "message": d.message,
                "source": d.source,
            }
            for d in diags
        ]
    )


@router.patch("/{resume_id}", response_model=ResumeOut)
def update_resume(
    resume_id: str,
    body: ResumeUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ResumeOut:
    resume = _load_owned(session, user, resume_id)
    if body.title is not None:
        resume.title = body.title
    if body.template_id is not None:
        resume.template_id = body.template_id
    if body.tags is not None:
        resume.tags = normalize_tags(body.tags)
    if body.structured_json is not None:
        resume.structured_json = body.structured_json
    if body.latex_body is not None:
        key = resume.latex_key or _latex_key(user.id, resume.id)
        store.put(key, body.latex_body.encode("utf-8"))
        resume.latex_key = key
    resume.updated_at = datetime.now(timezone.utc)
    session.add(resume)
    session.commit()
    session.refresh(resume)
    return _to_out(resume, store)


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume(
    resume_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> None:
    resume = _load_owned(session, user, resume_id)
    if resume.latex_key and store.exists(resume.latex_key):
        store.delete(resume.latex_key)
    session.delete(resume)
    session.commit()


def _work_dir(data_dir: str, user_id: str, resume_id: str):
    from pathlib import Path

    # data_dir must already be absolute (get_settings freezes it). Never use CWD.
    base = Path(data_dir).resolve()
    p = (base / "users" / user_id / "resumes" / resume_id / "work").resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.post("/{resume_id}/compile")
def compile_resume(
    resume_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> dict:
    from app.config import get_settings

    resume = _load_owned(session, user, resume_id)
    compiler = request.app.state.compiler
    latex = None
    if resume.latex_key and store.exists(resume.latex_key):
        latex = store.get(resume.latex_key).decode("utf-8", errors="replace")
    work = _work_dir(get_settings().data_dir, user.id, resume.id)
    result = compiler.compile(
        title=resume.title or "Resume",
        track=resume.track,
        latex=latex,
        structured=resume.structured_json,
        work_dir=work,
    )
    pdf_key = f"users/{user.id}/resumes/{resume.id}/out.pdf"
    if result.get("pdf_bytes"):
        store.put(pdf_key, result["pdf_bytes"])
        (work / "main.pdf").write_bytes(result["pdf_bytes"])
        result = {
            **{k: v for k, v in result.items() if k != "pdf_bytes"},
            "pdf_key": pdf_key,
            "engine": result.get("engine", "layout"),
            "download_path": f"/api/v1/resumes/{resume.id}/pdf",
            "preview_path": f"/api/v1/resumes/{resume.id}/pdf?inline=1",
        }
    return result


@router.get("/{resume_id}/pdf")
def download_pdf(
    resume_id: str,
    inline: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> Response:
    """Download or inline-preview compiled PDF for an owned resume."""
    resume = _load_owned(session, user, resume_id)
    pdf_key = f"users/{user.id}/resumes/{resume.id}/out.pdf"
    if not store.exists(pdf_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not compiled yet")
    data = store.get(pdf_key)
    # Guard: reject tiny corrupt stubs from older compiles
    if len(data) < 200 or not data.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="PDF is invalid or outdated — recompile",
        )
    filename = f"{(resume.title or 'resume').replace(' ', '_')}.pdf"
    disp = "inline" if inline else "attachment"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disp}; filename="{filename}"',
            "Cache-Control": "no-store",
            "Content-Length": str(len(data)),
        },
    )


@router.post("/{resume_id}/extract")
def extract_resume(
    resume_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    resume = _load_owned(session, user, resume_id)
    extractor = request.app.state.extractor
    data = extractor.extract(b"", "application/pdf")
    resume.structured_json = data
    resume.track = "structured"
    resume.updated_at = datetime.now(timezone.utc)
    session.add(resume)
    session.commit()
    return data


@router.post("/{resume_id}/score", response_model=JobOut)
def score_resume(
    resume_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
    body: ScoreRequest = ScoreRequest(),
) -> JobOut:
    from app.chat.safety import sanitize_jd
    from app.github.cache import load_snapshot

    resume = _load_owned(session, user, resume_id)
    job = ScoreJob(resume_id=resume.id, user_id=user.id, status="queued")
    session.add(job)
    session.commit()
    session.refresh(job)

    jd = sanitize_jd(body.job_description if body else None)
    snapshot = {
        "resume_id": resume.id,
        "track": resume.track,
        "structured_json": resume.structured_json,
        "latex_body": None,
        "job_description": jd,
        "github_snapshot": load_snapshot(store, user.id),
    }
    if resume.latex_key and store.exists(resume.latex_key):
        snapshot["latex_body"] = store.get(resume.latex_key).decode("utf-8", errors="replace")

    runner = request.app.state.job_runner
    engine = request.app.state.score_engine

    def _run() -> None:
        from sqlmodel import Session as S

        from app.db import engine as db_engine

        with S(db_engine) as s:
            row = s.get(ScoreJob, job.id)
            if not row:
                return
            row.status = "processing"
            row.updated_at = datetime.now(timezone.utc)
            s.add(row)
            s.commit()
            try:
                result = engine.run(snapshot, job_id=job.id)
                row.result_json = result
                if result.get("status") == "failed" or result.get("error"):
                    row.status = "failed"
                    row.error = str(result.get("error") or "scoring failed")
                else:
                    row.status = "complete"
                    row.error = None
            except Exception as exc:  # ponytail: surface failure on job row
                row.status = "failed"
                row.error = str(exc)
            row.updated_at = datetime.now(timezone.utc)
            s.add(row)
            s.commit()

    runner.enqueue(job.id, _run)
    return JobOut(
        id=job.id,
        resume_id=job.resume_id,
        status=job.status,
        result_json=job.result_json,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/{resume_id}/versions", response_model=list[VersionOut])
def list_resume_versions(
    resume_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> list[VersionOut]:
    from app.resumes.versions import list_versions

    resume = _load_owned(session, user, resume_id)
    items = list_versions(store, user.id, resume.id)
    return [VersionOut(**v) for v in items]


@router.post("/{resume_id}/versions")
def commit_resume_version(
    resume_id: str,
    body: VersionCommitRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> dict:
    from app.resumes.versions import commit_version

    resume = _load_owned(session, user, resume_id)
    latex = ""
    if resume.latex_key and store.exists(resume.latex_key):
        latex = store.get(resume.latex_key).decode("utf-8", errors="replace")
    return commit_version(store, user.id, resume.id, latex, body.message or "")


@router.post("/{resume_id}/versions/{version_id}/restore", response_model=ResumeOut)
def restore_resume_version(
    resume_id: str,
    version_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ResumeOut:
    from app.resumes.versions import read_version_body

    resume = _load_owned(session, user, resume_id)
    body = read_version_body(store, user.id, resume.id, version_id)
    if body is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
    key = resume.latex_key or _latex_key(user.id, resume.id)
    store.put(key, body.encode("utf-8"))
    resume.latex_key = key
    resume.updated_at = datetime.now(timezone.utc)
    session.add(resume)
    session.commit()
    session.refresh(resume)
    return _to_out(resume, store)


@router.post("/{resume_id}/chat", response_model=ChatResponse)
def chat_resume(
    resume_id: str,
    body: ChatRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ChatResponse:
    from fastapi import HTTPException

    from app.chat.safety import sanitize_jd

    resume = _load_owned(session, user, resume_id)
    completed = session.exec(
        select(ScoreJob).where(
            ScoreJob.resume_id == resume.id,
            ScoreJob.user_id == user.id,
            ScoreJob.status == "complete",
        )
    ).all()
    latest = max(completed, key=lambda j: j.created_at) if completed else None
    latex = None
    if resume.latex_key and store.exists(resume.latex_key):
        latex = store.get(resume.latex_key).decode("utf-8", errors="replace")
    coach = request.app.state.coach
    try:
        return coach.advise(
            resume_content=latex or str(resume.structured_json or {}),
            score_json=latest.result_json if latest else None,
            job_description=sanitize_jd(body.job_description),
            action=body.action,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{resume_id}/apply-edit", response_model=ResumeOut)
def apply_edit(
    resume_id: str,
    body: ApplyEditRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ResumeOut:
    from app.chat.hunks import apply_hunks
    from app.chat.safety import MAX_EDIT_CHARS, sanitize_text
    from app.latex_validate import validate_latex_apply

    resume = _load_owned(session, user, resume_id)
    section = (body.section or "")[:64]
    hunks = body.hunks or []
    if not hunks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hunks required")

    if section == "latex" or (resume.track == "latex" and section != "summary"):
        before = ""
        if resume.latex_key and store.exists(resume.latex_key):
            before = store.get(resume.latex_key).decode("utf-8", errors="replace")
        try:
            after = apply_hunks(before, hunks)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        after = sanitize_text(after, max_len=MAX_EDIT_CHARS, field="after")
        err = validate_latex_apply(before, after)
        if err:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err)
        key = resume.latex_key or _latex_key(user.id, resume.id)
        store.put(key, after.encode("utf-8"))
        resume.latex_key = key
    else:
        data = dict(resume.structured_json or _empty_structured())
        if section in ("summary", "basics.summary"):
            basics = dict(data.get("basics") or {})
            current = str(basics.get("summary") or "")
            try:
                basics["summary"] = apply_hunks(current, hunks)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            data["basics"] = basics
        else:
            key0 = section.split(".")[0]
            current = str(data.get(key0) or "")
            try:
                data[key0] = apply_hunks(current, hunks)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        resume.structured_json = data
    resume.updated_at = datetime.now(timezone.utc)
    session.add(resume)
    session.commit()
    session.refresh(resume)
    return _to_out(resume, store)
