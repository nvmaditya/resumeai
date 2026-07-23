"""LangGraph form→LaTeX agent: LLM (skill) seed → lint → compile → revise."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, TypedDict

from langgraph.graph import END, StateGraph

from app.generate.form_to_latex import form_to_latex
from app.generate.skill_loader import load_latex_generate_skill
from app.latex_lint import lint_latex


MAX_ITERS = 3


class AgentState(TypedDict, total=False):
    structured: dict[str, Any]
    title: str
    latex: str
    diagnostics: list[dict[str, Any]]
    iteration: int
    status: str
    error: str
    skill: str
    use_stub: bool
    llm_seed: Any  # Callable → latex
    llm_revise: Any  # Callable → latex
    used_llm: bool


@dataclass
class GenerateResult:
    latex: str
    status: str
    iterations: int
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    skill_loaded: bool = False
    used_llm: bool = False


def _error_diags(diags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [d for d in diags if d.get("severity") == "error"]


def tool_lint(latex: str) -> list[dict[str, Any]]:
    text = latex or ""
    diags = lint_latex(text, run_compile=False, tectonic_binary=None)
    out: list[dict[str, Any]] = []
    for d in diags:
        out.append(d.to_dict() if hasattr(d, "to_dict") else dict(d))  # type: ignore[arg-type]
    if "\\documentclass" not in text:
        out.append(
            {
                "line": None,
                "severity": "error",
                "message": "missing \\documentclass",
                "source": "generate",
            }
        )
    if "\\begin{document}" not in text:
        out.append(
            {
                "line": None,
                "severity": "error",
                "message": "missing \\begin{document}",
                "source": "generate",
            }
        )
    if "\\end{document}" not in text:
        out.append(
            {
                "line": None,
                "severity": "error",
                "message": "missing \\end{document}",
                "source": "generate",
            }
        )
    return out


def tool_compile(latex: str, work_dir: Path | None = None) -> dict[str, Any]:
    from app.compile.tectonic import build_compiler

    wd = work_dir or Path(tempfile.mkdtemp(prefix="resumeai_gen_"))
    wd.mkdir(parents=True, exist_ok=True)
    compiler = build_compiler(None)
    result = compiler.compile(
        title="Resume",
        track="latex",
        latex=latex,
        structured=None,
        work_dir=wd,
    )
    pdf = result.get("pdf_bytes") or b""
    ok = bool(pdf) and pdf.startswith(b"%PDF") and len(pdf) >= 200
    return {
        "ok": ok,
        "engine": result.get("engine"),
        "message": result.get("message") or result.get("error") or "",
        "bytes": len(pdf) if pdf else 0,
    }


def _looks_like_doc(latex: str) -> bool:
    t = latex or ""
    return (
        "\\documentclass" in t
        and "\\begin{document}" in t
        and "\\end{document}" in t
    )


def _node_seed(state: AgentState) -> dict[str, Any]:
    skill = load_latex_generate_skill()
    structured = state.get("structured") or {}
    title = state.get("title") or "Resume"
    use_stub = bool(state.get("use_stub", True))
    used_llm = False
    latex = ""

    llm_seed: Callable[..., str] | None = state.get("llm_seed")
    if llm_seed and not use_stub:
        try:
            latex = llm_seed(structured=structured, title=title, skill=skill)
            if _looks_like_doc(latex):
                used_llm = True
            else:
                latex = ""
        except Exception:
            latex = ""

    if not latex:
        latex = form_to_latex(structured, title=title)

    return {
        "skill": skill,
        "latex": latex,
        "iteration": 0,
        "diagnostics": [],
        "status": "processing",
        "error": "",
        "used_llm": used_llm,
    }


def _node_lint(state: AgentState) -> dict[str, Any]:
    diags = tool_lint(state.get("latex") or "")
    return {"diagnostics": diags}


def _repair_latex(latex: str, diags: list[dict[str, Any]], state: AgentState) -> str:
    reviser: Callable[..., str] | None = state.get("llm_revise")
    use_stub = bool(state.get("use_stub", True))
    if reviser and not use_stub:
        try:
            fixed = reviser(
                latex=latex,
                diagnostics=diags,
                skill=state.get("skill") or "",
                structured=state.get("structured") or {},
                title=state.get("title") or "Resume",
            )
            if _looks_like_doc(fixed):
                return fixed
        except Exception:
            pass
    text = latex or ""
    if "\\documentclass" not in text:
        text = (
            r"\documentclass[11pt]{article}"
            + "\n"
            + r"\usepackage[margin=1in]{geometry}"
            + "\n"
            + r"\begin{document}"
            + "\n"
            + text
        )
    if "\\begin{document}" not in text:
        if "\\documentclass" in text:
            text = text.replace(
                "\\documentclass[11pt,letterpaper]{article}",
                "\\documentclass[11pt,letterpaper]{article}\n\\begin{document}",
                1,
            )
        if "\\begin{document}" not in text:
            text = r"\begin{document}" + "\n" + text
    if "\\end{document}" not in text:
        text = text.rstrip() + "\n\\end{document}\n"
    static_errs = _error_diags(tool_lint(text))
    if static_errs:
        text = form_to_latex(
            state.get("structured") or {}, title=state.get("title") or "Resume"
        )
    return text


def _node_compile_or_fix(state: AgentState) -> dict[str, Any]:
    latex = state.get("latex") or ""
    diags = list(state.get("diagnostics") or [])
    errs = _error_diags(diags)
    iteration = int(state.get("iteration") or 0)

    if not errs:
        try:
            comp = tool_compile(latex)
            if comp.get("ok"):
                return {"status": "ok", "error": "", "diagnostics": diags}
            diags = diags + [
                {
                    "line": None,
                    "severity": "error",
                    "message": f"compile failed: {comp.get('message') or 'unknown'}",
                    "source": "compile",
                }
            ]
        except Exception as exc:
            diags = diags + [
                {
                    "line": None,
                    "severity": "error",
                    "message": f"compile error: {exc}",
                    "source": "compile",
                }
            ]

    if iteration + 1 >= MAX_ITERS:
        return {
            "diagnostics": diags,
            "status": "failed",
            "error": "lint/compile failed after max iterations",
            "iteration": iteration + 1,
        }

    fixed = _repair_latex(latex, diags, state)
    return {
        "latex": fixed,
        "diagnostics": diags,
        "iteration": iteration + 1,
        "status": "processing",
    }


def _route_after_compile(state: AgentState) -> str:
    if state.get("status") in ("ok", "failed"):
        return "done"
    return "lint"


def build_generate_graph():
    g = StateGraph(AgentState)
    g.add_node("seed", _node_seed)
    g.add_node("lint", _node_lint)
    g.add_node("compile_or_fix", _node_compile_or_fix)
    g.set_entry_point("seed")
    g.add_edge("seed", "lint")
    g.add_edge("lint", "compile_or_fix")
    g.add_conditional_edges(
        "compile_or_fix",
        _route_after_compile,
        {"lint": "lint", "done": END},
    )
    return g.compile()


_GRAPH = None


def _graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_generate_graph()
    return _GRAPH


def run_generate_agent(
    structured: dict[str, Any] | None,
    *,
    title: str = "Resume",
    use_stub: bool = True,
    llm_seed: Callable[..., str] | None = None,
    llm_revise: Callable[..., str] | None = None,
) -> GenerateResult:
    """Form JSON → LaTeX: optional LLM (skill) seed/revise + LangGraph lint/compile loop."""
    skill = load_latex_generate_skill()
    init: AgentState = {
        "structured": structured or {},
        "title": title,
        "use_stub": use_stub,
        "llm_seed": llm_seed,
        "llm_revise": llm_revise,
        "skill": skill,
    }
    final = _graph().invoke(init)
    latex = final.get("latex") or ""
    status = final.get("status") or "failed"
    diags = list(final.get("diagnostics") or [])
    skill_ok = bool(skill) and (
        "documentclass" in skill.lower() or "LaTeX" in skill or "latex" in skill
    )
    return GenerateResult(
        latex=latex,
        status=status if status in ("ok", "failed") else "failed",
        iterations=int(final.get("iteration") or 0),
        diagnostics=diags,
        error=final.get("error") or None,
        skill_loaded=skill_ok,
        used_llm=bool(final.get("used_llm")),
    )
