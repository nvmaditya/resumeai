from typing import Any

from app.chat.safety import (
    resolve_action,
    sanitize_jd,
    sanitize_text,
    wrap_untrusted,
    MAX_EDIT_CHARS,
    MAX_RESUME_CHARS,
)
from app.schemas import ChatResponse, EditHunk, ProposedEdit


class StubCoach:
    def advise(
        self,
        resume_content: str,
        score_json: dict[str, Any] | None,
        job_description: str | None,
        action: str,
    ) -> ChatResponse:
        instruction = resolve_action(action)
        resume = sanitize_text(resume_content, max_len=MAX_RESUME_CHARS, field="resume")
        jd = sanitize_jd(job_description)

        cats = (score_json or {}).get("categories") or []
        suggestions = []
        for c in cats:
            for s in c.get("suggestions") or []:
                suggestions.append(s.get("suggestion", ""))
            if c.get("evidence"):
                suggestions.append(str(c["evidence"])[:120])

        grounded = "; ".join(s for s in suggestions[:4] if s) or "no score yet — run score first"
        jd_note = f" JD data length={len(jd)}." if jd else " No JD provided."

        _ = (
            f"SYSTEM: resume coach. Only use score evidence and resume/JD data.\n"
            f"TASK: {instruction}\n"
            f"{wrap_untrusted('RESUME', resume[:2000])}\n"
            f"{wrap_untrusted('JD', jd)}\n"
            f"SCORE_HINTS: {grounded}\n"
        )

        reply = (
            f"Action: {action.replace('_', ' ')}. "
            f"Grounded on: {grounded}.{jd_note} "
            f"Hunks rephrase existing text only — no invented facts. Re-score after apply."
        )

        hunks: list[EditHunk] = []
        section = "latex"
        if "\\begin{document}" in resume:
            find = "\\begin{document}"
            replace = "\\begin{document}\n% AI: strengthen impact metrics (stub)\n"
            hunks = [EditHunk(find=find, replace=replace)]
        elif resume.strip().startswith("{") or '"basics"' in resume:
            section = "summary"
            reply += " Structured track: add metrics only if already true; stub has no summary hunk."
        elif resume:
            # last non-empty line as unique-ish find
            lines = [ln for ln in resume.splitlines() if ln.strip()]
            if lines:
                find = lines[-1]
                hunks = [EditHunk(find=find, replace=find + " [AI: quantify if already true]")]
                section = "summary"

        before = resume if len(resume) < 800 else resume[:800]
        pe = None
        if hunks:
            pe = ProposedEdit(
                section=section,
                before=before[:MAX_EDIT_CHARS],
                hunks=hunks,
            )
        return ChatResponse(reply=reply, proposed_edit=pe)
