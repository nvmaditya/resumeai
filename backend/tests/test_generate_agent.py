"""Real entry: run_generate_agent + generate API + version delete."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.generate.agent import run_generate_agent, tool_lint
from app.generate.skill_loader import load_latex_generate_skill, skill_path


def test_skill_file_loaded():
    assert skill_path().is_file()
    text = load_latex_generate_skill()
    assert "documentclass" in text.lower() or "LaTeX" in text or "latex" in text


def test_run_generate_agent_form_to_latex():
    data = {
        "basics": {
            "name": "Ada Lovelace",
            "email": "ada@example.com",
            "summary": "Built analytical engines.",
            "github": "ada",
        },
        "work": [
            {
                "name": "Analytical Engines Ltd",
                "position": "Engineer",
                "startDate": "1840",
                "endDate": "1850",
                "summary": "Designed programs\nWrote notes",
            }
        ],
        "education": [],
        "skills": [{"name": "Languages", "keywords": ["math", "logic"]}],
        "projects": [],
    }
    result = run_generate_agent(data, title="Ada", use_stub=True)
    assert result.skill_loaded
    assert result.latex
    assert "\\documentclass" in result.latex
    assert "\\begin{document}" in result.latex
    assert "Ada" in result.latex
    assert "ada@example.com" in result.latex or "example.com" in result.latex
    # no placeholder socials
    assert "https://linkedin.com}" not in result.latex
    assert result.status in ("ok", "failed")
    # lint tool path used — static should be clean after agent
    errs = [d for d in tool_lint(result.latex) if d.get("severity") == "error"]
    if result.status == "ok":
        assert errs == []


def test_agent_repairs_or_reports_bad_seed(monkeypatch):
    """If seed were broken, loop either repairs or fails with diagnostics."""
    from app.generate import agent as agent_mod

    bad = "this is not latex at all"
    orig = agent_mod.form_to_latex

    def broken(*_a, **_k):
        return bad

    monkeypatch.setattr(agent_mod, "form_to_latex", broken)
    agent_mod._GRAPH = None
    try:
        result = run_generate_agent({"basics": {"name": "X"}}, title="X", use_stub=True)
        assert result.status in ("ok", "failed")
        if result.status == "failed":
            assert result.error or result.diagnostics
        else:
            assert "\\documentclass" in result.latex
    finally:
        monkeypatch.setattr(agent_mod, "form_to_latex", orig)
        agent_mod._GRAPH = None


def test_llm_seed_receives_skill_and_sets_latex():
    """Injected llm_seed/llm_revise must receive skill text; seed return becomes latex."""
    from app.generate.agent import run_generate_agent
    from app.generate.skill_loader import load_latex_generate_skill

    skill_text = load_latex_generate_skill()
    seen: dict[str, Any] = {}

    def fake_seed(*, structured, title, skill):
        seen["seed_skill"] = skill
        seen["title"] = title
        seen["name"] = (structured.get("basics") or {}).get("name")
        return (
            r"\documentclass{article}\begin{document}"
            r"LLM_SEEDED_MARKER "
            + str(seen["name"])
            + r"\end{document}"
        )

    def fake_revise(*, latex, diagnostics, skill, structured, title="Resume"):
        seen["revise_skill"] = skill
        seen["revise_called"] = True
        return latex

    result = run_generate_agent(
        {"basics": {"name": "Eve", "email": "e@x.y"}},
        title="Eve",
        use_stub=False,
        llm_seed=fake_seed,
        llm_revise=fake_revise,
    )
    assert skill_text
    assert seen.get("seed_skill") == skill_text
    assert "documentclass" in (seen.get("seed_skill") or "").lower() or "LaTeX" in (
        seen.get("seed_skill") or ""
    )
    assert "LLM_SEEDED_MARKER" in result.latex
    assert "Eve" in result.latex
    assert result.used_llm is True
    assert result.skill_loaded is True


def test_extract_latex_from_fenced_response():
    from app.generate.llm import extract_latex

    raw = "Here you go:\n```latex\n\\documentclass{article}\\begin{document}Hi\\end{document}\n```\n"
    out = extract_latex(raw)
    assert "\\documentclass" in out
    assert "Hi" in out
    assert "```" not in out


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
        json={"email": "gen@example.com", "password": "password1"},
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "gen@example.com", "password": "password1"},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_generate_api_persists_latex(client: TestClient):
    headers = _auth(client)
    resume = client.post(
        "/api/v1/resumes",
        headers=headers,
        json={
            "title": "Gen",
            "track": "latex",
            "template_id": "resume-classic-ats",
            "structured_json": {
                "basics": {"name": "Bob", "email": "b@c.d", "summary": "Hi"},
                "work": [],
                "education": [],
                "skills": [],
                "projects": [],
            },
        },
    )
    assert resume.status_code == 201, resume.text
    rid = resume.json()["id"]
    gen = client.post(f"/api/v1/resumes/{rid}/generate", headers=headers, json={})
    assert gen.status_code == 200, gen.text
    body = gen.json()
    assert body["skill_loaded"] is True
    assert body.get("used_llm") is False  # stub coach path
    assert "\\documentclass" in body["latex_body"]
    assert "Bob" in body["latex_body"]
    got = client.get(f"/api/v1/resumes/{rid}", headers=headers)
    assert "Bob" in (got.json().get("latex_body") or "")


def test_generate_api_calls_coach_complete(client: TestClient, monkeypatch):
    """HTTP path: non-stub COACH_BACKEND + coach.complete → used_llm + skill in prompt."""
    import app.config as config_mod

    monkeypatch.setenv("COACH_BACKEND", "ollama")
    config_mod.get_settings.cache_clear()

    calls: list[tuple[str, str]] = []

    class FakeCoach:
        def complete(self, system: str, user: str) -> str:
            calls.append((system, user))
            return (
                r"\documentclass{article}\begin{document}"
                r"HTTP_LLM_MARKER\end{document}"
            )

    client.app.state.coach = FakeCoach()
    try:
        headers = _auth(client)
        resume = client.post(
            "/api/v1/resumes",
            headers=headers,
            json={
                "title": "LLM",
                "track": "latex",
                "template_id": "resume-classic-ats",
                "structured_json": {
                    "basics": {"name": "Cara", "email": "c@d.e", "summary": "S"},
                    "work": [],
                    "education": [],
                    "skills": [],
                    "projects": [],
                },
            },
        )
        assert resume.status_code == 201, resume.text
        rid = resume.json()["id"]
        gen = client.post(f"/api/v1/resumes/{rid}/generate", headers=headers, json={})
        assert gen.status_code == 200, gen.text
        body = gen.json()
        assert calls, "router must call coach.complete when backend != stub"
        system, user = calls[0]
        assert "SKILL" in system or "skill" in system.lower() or "LaTeX" in system
        assert "Cara" in user or "Cara" in system
        assert body.get("used_llm") is True
        assert "HTTP_LLM_MARKER" in body["latex_body"]
        assert "Cara" in body["latex_body"] or "HTTP_LLM_MARKER" in body["latex_body"]
    finally:
        monkeypatch.setenv("COACH_BACKEND", "stub")
        config_mod.get_settings.cache_clear()
        client.app.state.coach = None


def test_version_delete(client: TestClient):
    headers = _auth(client)
    resume = client.post(
        "/api/v1/resumes",
        headers=headers,
        json={
            "title": "V",
            "track": "latex",
            "latex_body": r"\documentclass{article}\begin{document}V1\end{document}",
        },
    )
    rid = resume.json()["id"]
    c1 = client.post(
        f"/api/v1/resumes/{rid}/versions",
        headers=headers,
        json={"message": "first"},
    )
    assert c1.status_code == 200, c1.text
    vid = c1.json()["version"]["id"]
    listed = client.get(f"/api/v1/resumes/{rid}/versions", headers=headers)
    assert any(v["id"] == vid for v in listed.json())
    deleted = client.delete(f"/api/v1/resumes/{rid}/versions/{vid}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    listed2 = client.get(f"/api/v1/resumes/{rid}/versions", headers=headers)
    assert all(v["id"] != vid for v in listed2.json())
