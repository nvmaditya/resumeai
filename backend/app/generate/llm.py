"""Skill-guided LLM seed/revise for form→LaTeX (uses coach provider stack)."""

from __future__ import annotations

import json
import re
from typing import Any, Callable


def extract_latex(raw: str) -> str:
    """Pull a full LaTeX document from model output (fences / prose ok)."""
    text = (raw or "").strip()
    if not text:
        return ""
    # ```latex ... ``` or ``` ... ```
    m = re.search(r"```(?:latex|tex)?\s*([\s\S]*?)```", text, re.I)
    if m:
        text = m.group(1).strip()
    # Prefer from \documentclass if present
    idx = text.find("\\documentclass")
    if idx >= 0:
        text = text[idx:]
    # Trim trailing junk after \end{document}
    end = text.rfind("\\end{document}")
    if end >= 0:
        text = text[: end + len("\\end{document}")] + "\n"
    return text.strip() + ("\n" if text and not text.endswith("\n") else "")


def _form_json(structured: dict[str, Any], title: str) -> str:
    payload = {"title": title, "resume": structured or {}}
    return json.dumps(payload, ensure_ascii=False)[:14000]


def make_llm_seed(
    complete: Callable[[str, str], str],
) -> Callable[..., str]:
    """Return seed(structured, title, skill) → latex using skill + form JSON."""

    def seed(*, structured: dict[str, Any], title: str, skill: str) -> str:
        system = (
            "You generate complete, compilable LaTeX resumes.\n"
            "Output ONLY the LaTeX source (optional ```latex fence).\n"
            "Follow the skill rules below exactly. Never invent facts not in the form JSON.\n\n"
            f"=== SKILL ===\n{skill[:8000]}\n=== END SKILL ==="
        )
        user = (
            "Generate a full LaTeX resume from this form data (JSON).\n"
            f"{_form_json(structured, title)}\n"
        )
        raw = complete(system, user)
        return extract_latex(raw)

    return seed


def make_llm_revise(
    complete: Callable[[str, str], str],
) -> Callable[..., str]:
    """Return reviser(**kwargs) used by agent repair loop; receives skill."""

    def revise(
        *,
        latex: str,
        diagnostics: list[dict[str, Any]],
        skill: str,
        structured: dict[str, Any],
        title: str = "Resume",
    ) -> str:
        diags = json.dumps(diagnostics or [], ensure_ascii=False)[:3000]
        system = (
            "You repair LaTeX so it compiles. Output ONLY fixed LaTeX.\n"
            "Keep all facts from the form; fix structure only.\n\n"
            f"=== SKILL ===\n{skill[:6000]}\n=== END SKILL ==="
        )
        user = (
            f"DIAGNOSTICS:\n{diags}\n\n"
            f"FORM JSON:\n{_form_json(structured, title)}\n\n"
            f"CURRENT LATEX:\n{latex[:12000]}\n"
        )
        raw = complete(system, user)
        fixed = extract_latex(raw)
        return fixed if fixed else latex

    return revise


def coach_complete_fn(coach: Any) -> Callable[[str, str], str] | None:
    """Bind LlmCoach.complete; StubCoach has no complete → None."""
    if coach is None:
        return None
    if hasattr(coach, "complete") and callable(coach.complete):
        return lambda system, user: coach.complete(system, user)
    return None
