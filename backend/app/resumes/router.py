from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_user, get_store
from app.models import Resume, ScoreJob, User
from app.schemas import (
    ApplyEditRequest,
    ChatRequest,
    ChatResponse,
    JobOut,
    ResumeCreate,
    ResumeOut,
    ResumeUpdate,
)
from app.storage.protocol import ObjectStore

router = APIRouter(prefix="/resumes", tags=["resumes"])


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


@router.post("", response_model=ResumeOut, status_code=status.HTTP_201_CREATED)
def create_resume(
    body: ResumeCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> ResumeOut:
    structured = None
    if body.track == "structured":
        structured = body.structured_json or _empty_structured()
    resume = Resume(
        user_id=user.id,
        title=body.title,
        track=body.track,
        structured_json=structured,
        template_id=body.template_id,
    )
    session.add(resume)
    session.commit()
    session.refresh(resume)

    if body.track == "latex":
        key = _latex_key(user.id, resume.id)
        store.put(key, (body.latex_body or "% Resume\n").encode("utf-8"))
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
        # also keep a copy next to synctex for CLI
        (work / "main.pdf").write_bytes(result["pdf_bytes"])
        result = {
            **{k: v for k, v in result.items() if k != "pdf_bytes"},
            "pdf_key": pdf_key,
            "engine": result.get("engine", "layout"),
            "synctex": bool(result.get("synctex")),
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


@router.post("/{resume_id}/synctex/edit")
def synctex_edit(
    resume_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Inverse search: PDF click (page,x,y top-left bp) → tex line/column via official synctex CLI."""
    from app.compile.synctex import inverse_search
    from app.config import get_settings

    resume = _load_owned(session, user, resume_id)
    work = _work_dir(get_settings().data_dir, user.id, resume.id)
    pdf_path = work / "main.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Compile first (no work PDF for SyncTeX)")
    try:
        page = int(body.get("page") or 1)
        x = float(body.get("x") or 0)
        y = float(body.get("y") or 0)
        hit = inverse_search(pdf_path=pdf_path, page=page, x=x, y=y, work_dir=work)
        return hit
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{resume_id}/synctex/view")
def synctex_view(
    resume_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Forward search: editor line/column → PDF page/x/y via official synctex CLI."""
    from app.compile.synctex import forward_search
    from app.config import get_settings

    resume = _load_owned(session, user, resume_id)
    work = _work_dir(get_settings().data_dir, user.id, resume.id)
    pdf_path = work / "main.pdf"
    tex_path = work / "main.tex"
    if not pdf_path.exists() or not tex_path.exists():
        raise HTTPException(status_code=404, detail="Compile first (no SyncTeX work files)")
    try:
        line = int(body.get("line") or 1)
        column = int(body.get("column") or 0)
        hit = forward_search(
            tex_path=tex_path,
            pdf_path=pdf_path,
            line=line,
            column=column,
            work_dir=work,
        )
        return hit
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
) -> JobOut:
    resume = _load_owned(session, user, resume_id)
    job = ScoreJob(resume_id=resume.id, user_id=user.id, status="queued")
    session.add(job)
    session.commit()
    session.refresh(job)

    snapshot = {
        "resume_id": resume.id,
        "track": resume.track,
        "structured_json": resume.structured_json,
        "latex_body": None,
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
    from app.chat.safety import MAX_EDIT_CHARS, sanitize_text
    from app.latex_validate import validate_latex_apply

    resume = _load_owned(session, user, resume_id)
    after = sanitize_text(body.after, max_len=MAX_EDIT_CHARS, field="after")
    section = (body.section or "")[:64]
    if section == "latex" or (resume.track == "latex" and section != "summary"):
        before = ""
        if resume.latex_key and store.exists(resume.latex_key):
            before = store.get(resume.latex_key).decode("utf-8", errors="replace")
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
            basics["summary"] = after
            data["basics"] = basics
        else:
            # ponytail: top-level key only
            data[section.split(".")[0]] = after
        resume.structured_json = data
    resume.updated_at = datetime.now(timezone.utc)
    session.add(resume)
    session.commit()
    session.refresh(resume)
    return _to_out(resume, store)
