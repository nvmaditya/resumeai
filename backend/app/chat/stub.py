from typing import Any

from app.schemas import ChatResponse, ProposedEdit


class StubCoach:
    def advise(
        self,
        resume_content: str,
        score_json: dict[str, Any] | None,
        job_description: str | None,
        message: str,
    ) -> ChatResponse:
        cats = (score_json or {}).get("categories") or []
        evidence_bits = [c.get("evidence", "") for c in cats[:2] if c.get("evidence")]
        grounded = "; ".join(evidence_bits) if evidence_bits else "no score yet — run score first for grounded advice"
        jd_note = f" JD provided ({len(job_description)} chars)." if job_description else ""
        snippet = resume_content[:200].replace("\n", " ")
        reply = (
            f"Grounded on score signals: {grounded}.{jd_note} "
            f"You asked: {message!r}. Resume starts with: {snippet!r}."
        )
        before = resume_content if len(resume_content) < 500 else resume_content[:500]
        after = before
        if "\\begin{document}" in before:
            after = before.replace(
                "\\begin{document}",
                "\\begin{document}\n% AI: strengthen impact metrics\n",
                1,
            )
        elif before:
            after = before + "\n\n[AI suggestion: add quantified impact to top project.]"
        else:
            after = "Improved summary with metrics."

        return ChatResponse(
            reply=reply,
            proposed_edit=ProposedEdit(section="latex", before=before, after=after),
        )
