"""Allowlisted LaTeX starter templates from repo templates/ + optional meta.json."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

# backend/app -> repo root
TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "templates"

# Shared form superset (form UI filters by meta.fields / meta.sections)
DEFAULT_FIELDS: list[str] = [
    "basics.name",
    "basics.email",
    "basics.phone",
    "basics.location",
    "basics.website",
    "basics.linkedin",
    "basics.github",
    "basics.summary",
]
DEFAULT_SECTIONS: list[str] = [
    "education",
    "work",
    "projects",
    "skills",
    "publications",
    "awards",
    "certifications",
]


@dataclass(frozen=True)
class TemplateInfo:
    id: str
    title: str
    filename: str
    fields: list[str] = field(default_factory=lambda: list(DEFAULT_FIELDS))
    sections: list[str] = field(default_factory=lambda: list(DEFAULT_SECTIONS))


def _humanize(stem: str) -> str:
    s = stem.removeprefix("resume-").replace("-", " ")
    return s.title() if s else stem


def _load_meta(stem: str) -> tuple[list[str], list[str]]:
    path = TEMPLATES_DIR / f"{stem}.meta.json"
    if not path.is_file():
        return list(DEFAULT_FIELDS), list(DEFAULT_SECTIONS)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return list(DEFAULT_FIELDS), list(DEFAULT_SECTIONS)
    if not isinstance(raw, dict):
        return list(DEFAULT_FIELDS), list(DEFAULT_SECTIONS)
    fields = raw.get("fields")
    sections = raw.get("sections")
    fl = (
        [str(x) for x in fields if str(x).strip()]
        if isinstance(fields, list) and fields
        else list(DEFAULT_FIELDS)
    )
    sl = (
        [str(x) for x in sections if str(x).strip()]
        if isinstance(sections, list) and sections
        else list(DEFAULT_SECTIONS)
    )
    return fl, sl


def list_templates() -> list[TemplateInfo]:
    if not TEMPLATES_DIR.is_dir():
        return []
    out: list[TemplateInfo] = []
    for p in sorted(TEMPLATES_DIR.glob("*.tex")):
        fl, sl = _load_meta(p.stem)
        out.append(
            TemplateInfo(
                id=p.stem,
                title=_humanize(p.stem),
                filename=p.name,
                fields=fl,
                sections=sl,
            )
        )
    return out


def get_template(template_id: str) -> TemplateInfo | None:
    tid = (template_id or "").strip()
    for t in list_templates():
        if t.id == tid:
            return t
    return None


def load_template_body(template_id: str) -> str:
    """Load template source. Rejects path traversal."""
    tid = (template_id or "").strip()
    if not tid or "/" in tid or "\\" in tid or ".." in tid:
        raise ValueError("invalid template_id")
    allowed = {t.id for t in list_templates()}
    if tid not in allowed:
        raise ValueError("unknown template_id")
    path = (TEMPLATES_DIR / f"{tid}.tex").resolve()
    if not str(path).startswith(str(TEMPLATES_DIR.resolve())):
        raise ValueError("invalid template_id")
    if not path.is_file():
        raise ValueError("unknown template_id")
    return path.read_text(encoding="utf-8")
