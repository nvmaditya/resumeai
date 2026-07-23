"""Load the in-repo LaTeX generation skill for agent prompts."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

# backend/app/generate → repo root
_REPO = Path(__file__).resolve().parents[3]
_SKILL = _REPO / ".grok" / "skills" / "resume-latex-generate" / "SKILL.md"


@lru_cache
def load_latex_generate_skill() -> str:
    if _SKILL.is_file():
        return _SKILL.read_text(encoding="utf-8")
    return (
        "Generate compilable LaTeX from form JSON. "
        "Full document, no invented facts, omit empty sections."
    )


def skill_path() -> Path:
    return _SKILL
