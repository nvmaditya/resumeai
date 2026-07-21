from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_user
from app.models import ScoreJob, User
from app.schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> JobOut:
    job = session.exec(
        select(ScoreJob).where(ScoreJob.id == job_id, ScoreJob.user_id == user.id)
    ).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobOut(
        id=job.id,
        resume_id=job.resume_id,
        status=job.status,
        result_json=job.result_json,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )
