from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from app.auth.security import create_access_token, hash_password, verify_password
from app.config import get_settings
from app.db import get_session
from app.deps import get_current_user, get_store
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, TokenOut, UserOut
from app.schemas.api import UserProfile, UserUpdate
from app.storage.protocol import ObjectStore

router = APIRouter(prefix="/auth", tags=["auth"])


def _profile(user: User) -> UserProfile:
    raw = user.profile_json or {}
    if not isinstance(raw, dict):
        raw = {}
    return UserProfile(
        display_name=str(raw.get("display_name") or ""),
        github_username=str(raw.get("github_username") or ""),
        linkedin_url=str(raw.get("linkedin_url") or ""),
        portfolio_url=str(raw.get("portfolio_url") or ""),
        headline=str(raw.get("headline") or ""),
    )


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        created_at=user.created_at,
        profile=_profile(user),
    )


@router.post("/register", response_model=UserOut)
def register(body: RegisterRequest, session: Session = Depends(get_session)) -> UserOut:
    existing = session.exec(select(User).where(User.email == body.email.lower())).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return _to_out(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginRequest, session: Session = Depends(get_session)) -> TokenOut:
    user = session.exec(select(User).where(User.email == body.email.lower())).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _to_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserOut:
    if body.profile is not None:
        cur = dict(user.profile_json or {})
        incoming = body.profile.model_dump()
        # Partial-friendly: always apply github_username; other keys only if non-empty
        # so Settings "github only" PATCH does not wipe legacy profile fields.
        cur["github_username"] = str(incoming.get("github_username") or "")[:500]
        for k in ("display_name", "linkedin_url", "portfolio_url", "headline"):
            val = str(incoming.get(k) or "").strip()
            if val:
                cur[k] = val[:500]
        user.profile_json = cur
        session.add(user)
        session.commit()
        session.refresh(user)
    return _to_out(user)


@router.get("/me/github")
def github_status(
    user: User = Depends(get_current_user),
    store: ObjectStore = Depends(get_store),
) -> dict:
    from app.github.cache import load_snapshot

    snap = load_snapshot(store, user.id)
    if not snap:
        return {
            "cached": False,
            "username": _profile(user).github_username or None,
            "fetched_at": None,
            "repo_count": 0,
        }
    return {
        "cached": True,
        "username": snap.get("username"),
        "fetched_at": snap.get("fetched_at"),
        "repo_count": snap.get("total_repos") or len(snap.get("repos") or []),
    }


@router.post("/me/github/refresh")
def github_refresh(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    store: ObjectStore = Depends(get_store),
) -> dict:
    from app.github.cache import refresh_github

    username = _profile(user).github_username.strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set github_username in Settings first",
        )
    settings = get_settings()
    try:
        return refresh_github(
            username,
            vendor_path=settings.hiring_agent_path,
            store=store,
            user_id=user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub refresh failed: {exc}",
        ) from exc
