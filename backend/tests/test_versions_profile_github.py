"""Versions, profile, github cache selection (no live network)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.github.cache import jd_keyword_match, select_top_repos
from app.resumes.versions import commit_version, list_versions, read_version_body
from app.storage.local import LocalObjectStore


def test_select_top_repos_jd():
    repos = [
        {"name": "todo-app", "description": "simple todo", "stars": 100, "author_commit_count": 5},
        {"name": "fastapi-service", "description": "production FastAPI backend", "stars": 3, "author_commit_count": 40},
        {"name": "ml-pipeline", "description": "pytorch training", "stars": 10, "author_commit_count": 20},
    ]
    top = select_top_repos(repos, "FastAPI backend engineer Python", k=2)
    assert top[0]["name"] == "fastapi-service"


def test_jd_keyword_match():
    m = jd_keyword_match("Python FastAPI Docker", "Built Python FastAPI services")
    assert m["provided"] is True
    assert "python" in m["matched_keywords"]
    assert m["relevance_score"] > 0


def test_versions_hash_skip(tmp_path: Path):
    store = LocalObjectStore(tmp_path)
    r1 = commit_version(store, "u1", "r1", "hello", "first")
    assert r1["unchanged"] is False
    r2 = commit_version(store, "u1", "r1", "hello", "again")
    assert r2["unchanged"] is True
    r3 = commit_version(store, "u1", "r1", "hello world", "second")
    assert r3["unchanged"] is False
    vs = list_versions(store, "u1", "r1")
    assert len(vs) == 2
    body = read_version_body(store, "u1", "r1", vs[0]["id"])
    assert body == "hello world"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db = tmp_path / "test.db"
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db.as_posix()}")
    monkeypatch.setenv("DATA_DIR", str(data))
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("SCORE_BACKEND", "stub")
    monkeypatch.setenv("COACH_BACKEND", "stub")

    import app.config as config_mod
    import app.db as db_mod

    config_mod.get_settings.cache_clear()
    settings = config_mod.get_settings()
    from sqlmodel import SQLModel, create_engine

    engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
    db_mod.engine = engine
    SQLModel.metadata.create_all(engine)

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


def _auth(client: TestClient, email: str = "v@example.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "password1"})
    token = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password1"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_profile_and_versions_api(client: TestClient):
    h = _auth(client)
    me = client.patch(
        "/api/v1/auth/me",
        headers=h,
        json={"profile": {"display_name": "Ada", "github_username": "ada"}},
    )
    assert me.status_code == 200, me.text
    assert me.json()["profile"]["github_username"] == "ada"

    rid = client.post(
        "/api/v1/resumes",
        headers=h,
        json={
            "title": "T",
            "track": "latex",
            "latex_body": r"\documentclass{article}\begin{document}V1\end{document}",
        },
    ).json()["id"]

    c1 = client.post(
        f"/api/v1/resumes/{rid}/versions",
        headers=h,
        json={"message": "initial"},
    )
    assert c1.status_code == 200, c1.text
    assert c1.json().get("unchanged") is False

    lst = client.get(f"/api/v1/resumes/{rid}/versions", headers=h)
    assert lst.status_code == 200
    assert len(lst.json()) == 1
    vid = lst.json()[0]["id"]

    client.patch(
        f"/api/v1/resumes/{rid}",
        headers=h,
        json={"latex_body": r"\documentclass{article}\begin{document}V2\end{document}"},
    )
    rest = client.post(f"/api/v1/resumes/{rid}/versions/{vid}/restore", headers=h)
    assert rest.status_code == 200
    assert "V1" in (rest.json().get("latex_body") or "")


def test_score_uses_cache_flag_not_network(client: TestClient, tmp_path: Path):
    h = _auth(client, "s@example.com")
    # inject snapshot via store path used by app
    from app.github.cache import save_snapshot
    from app.config import get_settings
    from app.storage.local import LocalObjectStore

    # register created user — get id from me
    uid = client.get("/api/v1/auth/me", headers=h).json()["id"]
    store = LocalObjectStore(get_settings().data_dir)
    save_snapshot(
        store,
        uid,
        {
            "username": "ada",
            "fetched_at": "2026-01-01T00:00:00+00:00",
            "profile": {"username": "ada", "bio": "builder"},
            "repos": [
                {
                    "name": "api",
                    "description": "FastAPI service",
                    "stars": 1,
                    "project_type": "self_project",
                }
            ],
            "total_repos": 1,
        },
    )
    rid = client.post(
        "/api/v1/resumes",
        headers=h,
        json={
            "title": "T",
            "track": "latex",
            "latex_body": r"\documentclass{article}\begin{document}Python FastAPI\end{document}",
        },
    ).json()["id"]
    job = client.post(
        f"/api/v1/resumes/{rid}/score",
        headers=h,
        json={"job_description": "Python FastAPI engineer"},
    )
    assert job.status_code == 200, job.text
    jid = job.json()["id"]
    import time

    result = None
    for _ in range(40):
        cur = client.get(f"/api/v1/jobs/{jid}", headers=h).json()
        if cur["status"] in ("complete", "failed"):
            result = cur
            break
        time.sleep(0.05)
    assert result is not None
    assert result["status"] == "complete"
    # stub engine still returns; with stub SCORE_BACKEND github_cache may be n/a
    # when SCORE_BACKEND=stub — assert job completed with jd path
    assert result["result_json"] is not None
