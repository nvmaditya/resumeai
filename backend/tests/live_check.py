"""Live smoke: tectonic compile + ollama coach. Run with API up or use TestClient."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("JWT_SECRET", "live-test")
os.environ.setdefault("DATA_DIR", str(ROOT / "data" / "live_check"))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(ROOT / 'data' / 'live_check' / 'live.db').as_posix()}")
os.environ.setdefault("COACH_BACKEND", "ollama")
os.environ.setdefault("OLLAMA_MODEL", "gemma3:4b")
os.environ.setdefault("SCORE_BACKEND", "stub")

from app.config import get_settings
from app.main import create_app
from fastapi.testclient import TestClient

get_settings.cache_clear()

TEX = r"""
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.75in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\begin{document}
\begin{center}{\Large\bfseries Live Test Candidate}\end{center}
\section*{Experience}
Software engineer with Python and FastAPI.
\section*{Projects}
ResumeAI --- local resume coach.
\end{document}
"""


def main() -> int:
    # Ollama up?
    try:
        tags = httpx.get("http://127.0.0.1:11434/api/tags", timeout=5).json()
        models = [m.get("name") for m in tags.get("models", [])]
        print("ollama models:", models)
        assert any("gemma3" in (m or "") for m in models), "gemma3:4b not pulled"
    except Exception as e:
        print("FAIL ollama:", e)
        return 1

    app = create_app()
    with TestClient(app) as c:
        h = c.get("/api/v1/health").json()
        print("health:", h)
        assert h.get("latex_engine") == "tectonic", h
        assert h.get("coach_backend") == "ollama", h

        email = f"live{int(time.time())}@example.com"
        assert c.post("/api/v1/auth/register", json={"email": email, "password": "password1"}).status_code == 200
        tok = c.post("/api/v1/auth/login", json={"email": email, "password": "password1"}).json()["access_token"]
        hdr = {"Authorization": f"Bearer {tok}"}

        r = c.post(
            "/api/v1/resumes",
            headers=hdr,
            json={"title": "Live LaTeX", "track": "latex", "latex_body": TEX},
        )
        assert r.status_code == 201, r.text
        rid = r.json()["id"]

        comp = c.post(f"/api/v1/resumes/{rid}/compile", headers=hdr)
        assert comp.status_code == 200, comp.text
        body = comp.json()
        print("compile:", {k: body.get(k) for k in ("message", "engine", "bytes")})
        assert body.get("engine") == "tectonic", body
        assert (body.get("bytes") or 0) > 1000, body

        pdf = c.get(f"/api/v1/resumes/{rid}/pdf", headers=hdr)
        assert pdf.status_code == 200, pdf.text
        assert pdf.content.startswith(b"%PDF")
        assert len(pdf.content) > 1000
        print("pdf bytes:", len(pdf.content))

        chat = c.post(
            f"/api/v1/resumes/{rid}/chat",
            headers=hdr,
            json={"action": "improve_score", "job_description": "Python FastAPI backend engineer"},
        )
        assert chat.status_code == 200, chat.text
        cj = chat.json()
        print("coach reply[:200]:", (cj.get("reply") or "")[:200])
        assert cj.get("reply"), cj
        # real model should not be the old canned stub prefix only
        assert "Ollama coach error" not in (cj.get("reply") or ""), cj
        print("proposed_edit section:", (cj.get("proposed_edit") or {}).get("section"))
        print("OK live_check")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
