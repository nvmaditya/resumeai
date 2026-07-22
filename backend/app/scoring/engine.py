from __future__ import annotations

import re
import sys
import time
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
        "engine": "stub",
        "github_enriched": False,
        "duration_ms": 0,
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
                "suggestions": [],
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


_GITHUB_URL_RE = re.compile(
    r"https?://(?:www\.)?github\.com/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})",
    re.I,
)
_GITHUB_USER_RE = re.compile(
    r"(?:github\.com/|github:\s*|GitHub:\s*)(@?)([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})",
    re.I,
)


def extract_github_url(text: str, structured: dict[str, Any] | None) -> str | None:
    if structured:
        basics = structured.get("basics") or {}
        for p in basics.get("profiles") or []:
            if not isinstance(p, dict):
                continue
            net = (p.get("network") or "").lower()
            url = p.get("url") or ""
            if "github" in net and url:
                return url if url.startswith("http") else f"https://github.com/{url}"
            if "github.com" in url:
                return url if url.startswith("http") else f"https://{url}"
        for field in (basics.get("url"), basics.get("website")):
            if field and "github.com" in str(field):
                return str(field)
    blob = text or ""
    m = _GITHUB_URL_RE.search(blob)
    if m:
        return f"https://github.com/{m.group(1)}"
    m2 = _GITHUB_USER_RE.search(blob)
    if m2:
        return f"https://github.com/{m2.group(2)}"
    return None


class HiringAgentScoreEngine:
    """Full hiring-agent path: resume text + optional GitHub enrich + LLM evaluate."""

    def __init__(self, vendor_path: str) -> None:
        self.vendor_path = Path(vendor_path)

    def run(self, snapshot: dict[str, Any], job_id: str) -> dict[str, Any]:
        t0 = time.perf_counter()
        if str(self.vendor_path) not in sys.path:
            sys.path.insert(0, str(self.vendor_path))

        structured = snapshot.get("structured_json")
        latex = snapshot.get("latex_body") or ""
        text, github_url = self._resume_text(structured, latex)
        github_data: dict[str, Any] = {}
        github_enriched = False

        if github_url:
            try:
                from github import fetch_and_display_github_info  # type: ignore

                github_data = fetch_and_display_github_info(github_url) or {}
                github_enriched = bool(github_data.get("profile") or github_data.get("projects"))
            except Exception as exc:
                github_data = {"error": str(exc)}

        try:
            from evaluator import ResumeEvaluator  # type: ignore
            from prompt import DEFAULT_MODEL, MODEL_PARAMETERS  # type: ignore
            from transform import (  # type: ignore
                convert_github_data_to_text,
                convert_json_resume_to_text,
            )

            if structured:
                try:
                    from models import JSONResume  # type: ignore

                    resume = JSONResume(**structured)
                    resume_text = convert_json_resume_to_text(resume)
                except Exception:
                    resume_text = text
            else:
                resume_text = text

            if github_enriched:
                resume_text = resume_text + "\n\n" + convert_github_data_to_text(github_data)

            if not resume_text.strip():
                raise ValueError("empty resume text for evaluation")

            params = MODEL_PARAMETERS.get(DEFAULT_MODEL, {"temperature": 0.5, "top_p": 0.9})
            evaluator = ResumeEvaluator(model_name=DEFAULT_MODEL, model_params=params)
            evaluation = evaluator.evaluate_resume(resume_text)
            result = _map_evaluation(evaluation, job_id)
            result["engine"] = "hiring_agent"
            result["github_enriched"] = github_enriched
            result["github_url"] = github_url
            result["duration_ms"] = int((time.perf_counter() - t0) * 1000)
            return result
        except Exception as exc:
            # Do NOT return fake happy stub 72 — surface failure for product honesty
            ms = int((time.perf_counter() - t0) * 1000)
            return {
                "job_id": job_id,
                "status": "failed",
                "overall_score": 0,
                "engine": "hiring_agent",
                "github_enriched": github_enriched,
                "github_url": github_url,
                "duration_ms": ms,
                "error": str(exc),
                "categories": [],
                "jd_match": {
                    "provided": False,
                    "matched_keywords": [],
                    "missing_keywords": [],
                    "relevance_score": 0,
                },
            }

    def _resume_text(
        self, structured: dict[str, Any] | None, latex: str
    ) -> tuple[str, str | None]:
        if structured:
            blob = str(structured)
            return blob, extract_github_url(blob, structured)
        # strip light latex noise for LLM readability
        text = latex
        text = re.sub(r"%.*?$", "", text, flags=re.M)
        text = re.sub(r"\\[a-zA-Z]+\*?", " ", text)
        text = re.sub(r"[{}\[\]]", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text, extract_github_url(latex + " " + text, None)


def _map_evaluation(evaluation: Any, job_id: str) -> dict[str, Any]:
    categories: list[dict[str, Any]] = []
    total = 0.0
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
            categories[0]["deductions"] = (
                list(reasons) if isinstance(reasons, list) else [str(reasons)]
            )

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
