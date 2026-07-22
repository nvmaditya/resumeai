"""Hunk apply-edit unit + API paths."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.chat.hunks import apply_hunks


def test_apply_hunks_happy():
    doc = r"\documentclass{article}\begin{document}Hi\end{document}"
    out = apply_hunks(doc, [{"find": "Hi", "replace": "Hello"}])
    assert "Hello" in out
    assert "Hi" not in out


def test_apply_hunks_missing():
    with pytest.raises(ValueError, match="not found"):
        apply_hunks("abc", [{"find": "zzz", "replace": "x"}])


def test_apply_hunks_ambiguous():
    with pytest.raises(ValueError, match="not unique"):
        apply_hunks("xx xx", [{"find": "xx", "replace": "y"}])


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


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "h@example.com", "password": "password1"})
    token = client.post(
        "/api/v1/auth/login", json={"email": "h@example.com", "password": "password1"}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_apply_edit_api_hunk(client: TestClient):
    h = _auth(client)
    latex = r"\documentclass{article}\begin{document}Hi\end{document}"
    rid = client.post(
        "/api/v1/resumes",
        headers=h,
        json={"title": "T", "track": "latex", "latex_body": latex},
    ).json()["id"]

    ok = client.post(
        f"/api/v1/resumes/{rid}/apply-edit",
        headers=h,
        json={"section": "latex", "hunks": [{"find": "Hi", "replace": "Hello world"}]},
    )
    assert ok.status_code == 200, ok.text
    assert "Hello world" in (ok.json().get("latex_body") or "")

    bad = client.post(
        f"/api/v1/resumes/{rid}/apply-edit",
        headers=h,
        json={"section": "latex", "hunks": [{"find": "NOPE", "replace": "x"}]},
    )
    assert bad.status_code == 400

    broken = client.post(
        f"/api/v1/resumes/{rid}/apply-edit",
        headers=h,
        json={
            "section": "latex",
            "hunks": [{"find": r"\end{document}", "replace": ""}],
        },
    )
    assert broken.status_code == 400


def test_build_coach_backends():
    from app.chat.ollama import build_coach
    from app.chat.stub import StubCoach

    assert isinstance(build_coach(backend="stub"), StubCoach)
    c = build_coach(backend="openrouter", model="x", openrouter_api_key="k")
    assert c.backend == "openrouter"
    c2 = build_coach(backend="groq", model="y", groq_api_key="k")
    assert c2.backend == "groq"
