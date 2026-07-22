"""Allowlisted LaTeX starter templates from repo templates/."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# backend/app -> repo root
TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "templates"


@dataclass(frozen=True)
class TemplateInfo:
    id: str
    title: str
    filename: str


def _humanize(stem: str) -> str:
    s = stem.removeprefix("resume-").replace("-", " ")
    return s.title() if s else stem


def list_templates() -> list[TemplateInfo]:
    if not TEMPLATES_DIR.is_dir():
        return []
    out: list[TemplateInfo] = []
    for p in sorted(TEMPLATES_DIR.glob("*.tex")):
        out.append(TemplateInfo(id=p.stem, title=_humanize(p.stem), filename=p.name))
    return out


def load_template_body(template_id: str) -> str:
    """Load template source. Rejects path traversal."""
    tid = (template_id or "").strip()
    if not tid or "/" in tid or "\\" in tid or ".." in tid:
        raise ValueError("invalid template_id")
    # only allowlisted stems
    allowed = {t.id for t in list_templates()}
    if tid not in allowed:
        raise ValueError("unknown template_id")
    path = (TEMPLATES_DIR / f"{tid}.tex").resolve()
    if not str(path).startswith(str(TEMPLATES_DIR.resolve())):
        raise ValueError("invalid template_id")
    if not path.is_file():
        raise ValueError("unknown template_id")
    return path.read_text(encoding="utf-8")
