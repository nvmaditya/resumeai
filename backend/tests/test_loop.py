import os
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DIR = Path(__file__).resolve().parent / "_tmp"
TEST_DIR.mkdir(exist_ok=True)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db = tmp_path / "test.db"
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db.as_posix()}")
    monkeypatch.setenv("DATA_DIR", str(data))
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("SCORE_BACKEND", "stub")

    # Re-import app with fresh settings/engine
    import app.config as config_mod
    import app.db as db_mod

    config_mod.get_settings.cache_clear()
    settings = config_mod.get_settings()
    connect_args = {"check_same_thread": False}
    from sqlmodel import Session, SQLModel, create_engine

    engine = create_engine(settings.database_url, connect_args=connect_args)
    db_mod.engine = engine
    SQLModel.metadata.create_all(engine)

    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


def test_register_score_apply_edit(client: TestClient):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "a@example.com", "password": "password1"},
    )
    assert r.status_code == 200, r.text
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "a@example.com", "password": "password1"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resume = client.post(
        "/api/v1/resumes",
        headers=headers,
        json={
            "title": "T",
            "track": "latex",
            "latex_body": "\\documentclass{article}\\begin{document}Hi\\end{document}",
        },
    )
    assert resume.status_code == 201, resume.text
    rid = resume.json()["id"]

    score = client.post(f"/api/v1/resumes/{rid}/score", headers=headers)
    assert score.status_code == 200, score.text
    job_id = score.json()["id"]

    result = None
    for _ in range(50):
        job = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert job.status_code == 200
        body = job.json()
        if body["status"] in ("complete", "failed"):
            result = body
            break
        time.sleep(0.05)
    assert result is not None
    assert result["status"] == "complete"
    assert "overall_score" in result["result_json"]
    assert "categories" in result["result_json"]

    chat = client.post(
        f"/api/v1/resumes/{rid}/chat",
        headers=headers,
        json={"message": "Improve projects", "job_description": "Python backend"},
    )
    assert chat.status_code == 200
    pe = chat.json()["proposed_edit"]
    assert pe is not None

    applied = client.post(
        f"/api/v1/resumes/{rid}/apply-edit",
        headers=headers,
        json={"section": "latex", "after": pe["after"]},
    )
    assert applied.status_code == 200
    assert pe["after"] in (applied.json().get("latex_body") or "")


def test_cross_user_404(client: TestClient):
    client.post("/api/v1/auth/register", json={"email": "u1@example.com", "password": "password1"})
    client.post("/api/v1/auth/register", json={"email": "u2@example.com", "password": "password1"})
    t1 = client.post(
        "/api/v1/auth/login", json={"email": "u1@example.com", "password": "password1"}
    ).json()["access_token"]
    t2 = client.post(
        "/api/v1/auth/login", json={"email": "u2@example.com", "password": "password1"}
    ).json()["access_token"]
    rid = client.post(
        "/api/v1/resumes",
        headers={"Authorization": f"Bearer {t1}"},
        json={"title": "Mine", "track": "latex"},
    ).json()["id"]
    r = client.get(f"/api/v1/resumes/{rid}", headers={"Authorization": f"Bearer {t2}"})
    assert r.status_code == 404
