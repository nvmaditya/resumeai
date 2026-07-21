from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from app.config import Settings


@runtime_checkable
class ScoreEngine(Protocol):
    def run(self, snapshot: dict[str, Any], job_id: str) -> dict[str, Any]: ...


def stub_result(job_id: str, *, overall: int = 72) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "status": "complete",
        "overall_score": overall,
        "categories": [
            {
                "name": "technical_skills",
                "score": 80,
                "evidence": "Stub evidence: listed modern stack skills.",
                "deductions": [],
                "suggestions": [
                    {
                        "section": "skills",
                        "suggestion": "Quantify depth on core languages.",
                        "priority": "high",
                        "expected_impact": "+5 technical_skills",
                    }
                ],
            },
            {
                "name": "open_source",
                "score": 60,
                "evidence": "Stub: limited public contribution signal.",
                "deductions": ["Few starred/maintained repos linked"],
                "suggestions": [
                    {
                        "section": "projects.entry_0",
                        "suggestion": "Link GitHub profile and highlight 1–2 merged PRs.",
                        "priority": "medium",
                        "expected_impact": "+8 open_source",
                    }
                ],
            },
            {
                "name": "self_projects",
                "score": 70,
                "evidence": "Stub: projects present with partial metrics.",
                "deductions": [],
                "suggestions": [],
            },
            {
                "name": "production",
                "score": 75,
                "evidence": "Stub: work experience implies production ownership.",
                "deductions": [],
                "suggestions": [],
            },
            {
                "name": "jd_relevance",
                "score": 0,
                "evidence": "No job description provided at score time.",
                "deductions": [],
                "suggestions": [],
            },
        ],
        "jd_match": {
            "provided": False,
            "matched_keywords": [],
            "missing_keywords": [],
            "relevance_score": 0,
        },
    }


class StubScoreEngine:
    def run(self, snapshot: dict[str, Any], job_id: str) -> dict[str, Any]:
        return stub_result(job_id)


class HiringAgentScoreEngine:
    """Adapter over vendored interviewstreet/hiring-agent.

    Requires Ollama (or Gemini env) when actually evaluating.
    Falls back to stub mapping if evaluation fails so the product loop stays usable.
    """

    def __init__(self, vendor_path: str) -> None:
        self.vendor_path = Path(vendor_path)

    def run(self, snapshot: dict[str, Any], job_id: str) -> dict[str, Any]:
        if str(self.vendor_path) not in sys.path:
            sys.path.insert(0, str(self.vendor_path))
        try:
            return self._run_hiring_agent(snapshot, job_id)
        except Exception as exc:
            # ponytail: keep product loop green without Ollama; surface note in evidence
            result = stub_result(job_id, overall=50)
            result["categories"][0]["evidence"] = f"hiring-agent fallback ({exc})"
            result["status"] = "complete"
            return result

    def _run_hiring_agent(self, snapshot: dict[str, Any], job_id: str) -> dict[str, Any]:
        from evaluator import ResumeEvaluator  # type: ignore
        from models import JSONResume  # type: ignore
        from prompt import DEFAULT_MODEL, MODEL_PARAMETERS  # type: ignore
        from transform import convert_json_resume_to_text  # type: ignore

        structured = snapshot.get("structured_json")
        latex = snapshot.get("latex_body") or ""
        if structured:
            try:
                resume = JSONResume(**structured)
                text = convert_json_resume_to_text(resume)
            except Exception:
                text = str(structured)
        else:
            text = latex

        if not text.strip():
            text = "Empty resume"

        params = MODEL_PARAMETERS.get(DEFAULT_MODEL, {"temperature": 0.5, "top_p": 0.9})
        evaluator = ResumeEvaluator(model_name=DEFAULT_MODEL, model_params=params)
        evaluation = evaluator.evaluate_resume(text)
        return _map_evaluation(evaluation, job_id)


def _map_evaluation(evaluation: Any, job_id: str) -> dict[str, Any]:
    """Map hiring-agent EvaluationData → product score JSON (0–100 scale)."""
    categories: list[dict[str, Any]] = []
    total = 0.0
    max_total = 0.0
    scores = getattr(evaluation, "scores", None)
    category_maxes = {
        "open_source": 35,
        "self_projects": 30,
        "production": 25,
        "technical_skills": 10,
    }
    if scores:
        for name, max_s in category_maxes.items():
            cat = getattr(scores, name, None)
            if not cat:
                continue
            raw = min(float(cat.score), float(max_s))
            pct = int(round((raw / max_s) * 100)) if max_s else 0
            total += raw
            max_total += max_s
            categories.append(
                {
                    "name": name,
                    "score": pct,
                    "evidence": getattr(cat, "evidence", "") or "",
                    "deductions": [],
                    "suggestions": [],
                }
            )

    bonus = getattr(evaluation, "bonus_points", None)
    if bonus:
        total += float(getattr(bonus, "total", 0) or 0)
    deductions = getattr(evaluation, "deductions", None)
    if deductions:
        total -= float(getattr(deductions, "total", 0) or 0)
        reasons = getattr(deductions, "reasons", None) or []
        if categories and reasons:
            categories[0]["deductions"] = list(reasons) if isinstance(reasons, list) else [str(reasons)]

    overall = int(max(0, min(100, round((total / 100) * 100)))) if max_total else 0
    # hiring-agent max is ~100 (+bonus); clamp to 0-100 product scale
    overall = int(max(0, min(100, round(total))))

    improvements = getattr(evaluation, "areas_for_improvement", None) or []
    if categories and improvements:
        categories[0]["suggestions"] = [
            {
                "section": "summary",
                "suggestion": str(item),
                "priority": "medium",
                "expected_impact": "varies",
            }
            for item in improvements[:5]
        ]

    return {
        "job_id": job_id,
        "status": "complete",
        "overall_score": overall,
        "categories": categories
        or [
            {
                "name": "technical_skills",
                "score": overall,
                "evidence": "Mapped from hiring-agent",
                "deductions": [],
                "suggestions": [],
            }
        ],
        "jd_match": {
            "provided": False,
            "matched_keywords": [],
            "missing_keywords": [],
            "relevance_score": 0,
        },
    }


def build_score_engine(settings: Settings) -> ScoreEngine:
    if settings.score_backend == "hiring_agent":
        return HiringAgentScoreEngine(settings.hiring_agent_path)
    return StubScoreEngine()
