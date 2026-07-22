"""Regression: .tex download (PRD Track A) + template form/LaTeX save SoT."""

import pytest
from fastapi.testclient import TestClient


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


def _auth(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={"email": "tex@example.com", "password": "password1"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "tex@example.com", "password": "password1"},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_download_tex_for_latex_resume(client: TestClient):
    headers = _auth(client)
    body = r"\documentclass{article}\begin{document}ShipThis\end{document}"
    resume = client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"title": "My Resume", "track": "latex", "latex_body": body},
    )
    assert resume.status_code == 201, resume.text
    rid = resume.json()["id"]

    tex = client.get(f"/api/v1/resumes/{rid}/tex", headers=headers)
    assert tex.status_code == 200, tex.text
    assert b"ShipThis" in tex.content
    assert "attachment" in tex.headers.get("content-disposition", "").lower()
    assert ".tex" in tex.headers.get("content-disposition", "").lower()


def test_download_tex_404_without_source(client: TestClient):
    headers = _auth(client)
    resume = client.post(
        "/api/v1/resumes",
        headers=headers,
        json={"title": "Form only", "track": "structured"},
    )
    assert resume.status_code == 201, resume.text
    rid = resume.json()["id"]
    tex = client.get(f"/api/v1/resumes/{rid}/tex", headers=headers)
    assert tex.status_code == 404


def test_template_latex_override_survives_save_and_compile(client: TestClient):
    """Sending latex_body without structured must not be wiped by template re-fill."""
    headers = _auth(client)
    created = client.post(
        "/api/v1/resumes",
        headers=headers,
        json={
            "title": "From template",
            "track": "latex",
            "template_id": "resume-classic-ats",
            "structured_json": {
                "basics": {"name": "Ada", "email": "a@b.c", "summary": ""},
                "work": [],
                "education": [],
                "skills": [],
                "projects": [],
            },
        },
    )
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    assert created.json().get("template_id") == "resume-classic-ats"

    hand = (
        r"\documentclass{article}\begin{document}"
        r"HAND_EDITED_MARKER"
        r"\end{document}"
    )
    patched = client.patch(
        f"/api/v1/resumes/{rid}",
        headers=headers,
        json={"latex_body": hand},
    )
    assert patched.status_code == 200, patched.text
    assert "HAND_EDITED_MARKER" in (patched.json().get("latex_body") or "")

    # form-only save still regenerates (template SoT when no latex override)
    form_save = client.patch(
        f"/api/v1/resumes/{rid}",
        headers=headers,
        json={
            "structured_json": {
                "basics": {"name": "Ada", "email": "a@b.c", "summary": "S"},
                "work": [],
                "education": [],
                "skills": [],
                "projects": [],
            }
        },
    )
    assert form_save.status_code == 200, form_save.text
    # after form save, body comes from template fill (marker gone)
    assert "HAND_EDITED_MARKER" not in (form_save.json().get("latex_body") or "")

    # re-apply latex override
    client.patch(
        f"/api/v1/resumes/{rid}",
        headers=headers,
        json={"latex_body": hand},
    )
    comp = client.post(f"/api/v1/resumes/{rid}/compile", headers=headers)
    assert comp.status_code == 200, comp.text
    again = client.get(f"/api/v1/resumes/{rid}", headers=headers)
    assert "HAND_EDITED_MARKER" in (again.json().get("latex_body") or "")
