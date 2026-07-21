from typing import Any

from app.chat.safety import (
    resolve_action,
    sanitize_jd,
    sanitize_text,
    wrap_untrusted,
    MAX_EDIT_CHARS,
    MAX_RESUME_CHARS,
)
from app.schemas import ChatResponse, ProposedEdit


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

        # Internal prompt assembly (not returned) — fences untrusted blocks
        _ = (
            f"SYSTEM: You are a resume coach. Only use score evidence and resume/JD data.\n"
            f"TASK: {instruction}\n"
            f"{wrap_untrusted('RESUME', resume[:2000])}\n"
            f"{wrap_untrusted('JD', jd)}\n"
            f"SCORE_HINTS: {grounded}\n"
        )

        reply = (
            f"Action: {action.replace('_', ' ')}. "
            f"Grounded on: {grounded}.{jd_note} "
            f"Focus on measurable impact and missing keywords; re-score after applying edits."
        )

        before = resume if len(resume) < 800 else resume[:800]
        after = before
        if "\\begin{document}" in before:
            after = before.replace(
                "\\begin{document}",
                "\\begin{document}\n% AI: strengthen impact metrics\n",
                1,
            )
        elif before.strip().startswith("{") or '"basics"' in before:
            after = before  # structured: client applies field-level; propose summary bump
            reply += " Consider adding metrics to basics.summary and top project highlights."
        elif before:
            after = before + "\n\n[AI: add quantified impact to top project.]"
        else:
            after = "Improved summary with metrics."

        after = sanitize_text(after, max_len=MAX_EDIT_CHARS, field="edit")
        section = "latex" if "\\begin{document}" in before or "\\documentclass" in before else "summary"

        return ChatResponse(
            reply=reply,
            proposed_edit=ProposedEdit(section=section, before=before[:MAX_EDIT_CHARS], after=after),
        )
