"""Deterministic form→LaTeX (stub / first draft seed). Skill-aligned structure."""

from __future__ import annotations

from typing import Any


def _esc(s: Any) -> str:
    t = str(s or "")
    out: list[str] = []
    for ch in t:
        if ch in "\\&%$#_{}":
            out.append("\\" + ch)
        elif ch == "~":
            out.append(r"\textasciitilde{}")
        elif ch == "^":
            out.append(r"\textasciicircum{}")
        else:
            out.append(ch)
    return "".join(out)


def _basics(data: dict[str, Any]) -> dict[str, str]:
    b = data.get("basics") if isinstance(data.get("basics"), dict) else {}
    b = b or {}
    return {
        "name": str(b.get("name") or "").strip(),
        "email": str(b.get("email") or "").strip(),
        "phone": str(b.get("phone") or "").strip(),
        "location": str(b.get("location") or "").strip(),
        "website": str(b.get("website") or b.get("portfolio") or "").strip(),
        "linkedin": str(b.get("linkedin") or "").strip(),
        "github": str(b.get("github") or "").strip(),
        "summary": str(b.get("summary") or "").strip(),
    }


def _has_rows(rows: Any) -> bool:
    if not isinstance(rows, list) or not rows:
        return False
    for r in rows:
        if isinstance(r, dict) and any(str(v or "").strip() for v in r.values()):
            return True
    return False


def _bullets(text: Any) -> list[str]:
    raw = str(text or "").strip()
    if not raw:
        return []
    lines = [ln.strip() for ln in raw.replace("\r\n", "\n").split("\n")]
    return [ln.lstrip("•-* ").strip() for ln in lines if ln.strip()]


def form_to_latex(data: dict[str, Any] | None, *, title: str = "") -> str:
    """Skill-aligned deterministic draft — no invented facts."""
    data = data or {}
    b = _basics(data)
    name = _esc(b["name"] or title or "Resume")
    lines: list[str] = [
        r"\documentclass[11pt,letterpaper]{article}",
        r"\usepackage[margin=0.75in]{geometry}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage{lmodern}",
        r"\usepackage{hyperref}",
        r"\usepackage{enumitem}",
        r"\setlist{nosep,leftmargin=*}",
        r"\pagestyle{empty}",
        r"\begin{document}",
        r"\begin{center}",
        rf"{{\Large\bfseries {name}}}\\[0.35em]",
    ]
    contact: list[str] = []
    if b["location"]:
        contact.append(_esc(b["location"]))
    if b["phone"]:
        contact.append(_esc(b["phone"]))
    if b["email"]:
        contact.append(rf"\href{{mailto:{_esc(b['email'])}}}{{{_esc(b['email'])}}}")
    if b["linkedin"]:
        url = b["linkedin"] if b["linkedin"].startswith("http") else f"https://{b['linkedin']}"
        contact.append(rf"\href{{{_esc(url)}}}{{LinkedIn}}")
    if b["github"]:
        url = (
            b["github"]
            if b["github"].startswith("http")
            else f"https://github.com/{b['github']}"
        )
        contact.append(rf"\href{{{_esc(url)}}}{{GitHub}}")
    if b["website"]:
        url = b["website"] if b["website"].startswith("http") else f"https://{b['website']}"
        contact.append(rf"\href{{{_esc(url)}}}{{Portfolio}}")
    if contact:
        lines.append(r"\small " + r" $|$ ".join(contact))
    lines.append(r"\end{center}")
    lines.append("")

    if b["summary"]:
        lines += [r"\section*{Summary}", _esc(b["summary"]), ""]

    if _has_rows(data.get("work")):
        lines.append(r"\section*{Experience}")
        for w in data.get("work") or []:
            if not isinstance(w, dict):
                continue
            role = _esc(w.get("position") or "Role")
            co = _esc(w.get("name") or "")
            dates = _esc(
                " -- ".join(
                    x
                    for x in [
                        str(w.get("startDate") or "").strip(),
                        str(w.get("endDate") or "").strip(),
                    ]
                    if x
                )
            )
            lines.append(rf"\textbf{{{role}}} \hfill {dates}\\")
            if co:
                lines.append(rf"\textit{{{co}}}\\")
            for bl in _bullets(w.get("summary")):
                lines.append(r"\begin{itemize}")
                lines.append(rf"  \item {_esc(bl)}")
                lines.append(r"\end{itemize}")
            lines.append("")

    if _has_rows(data.get("education")):
        lines.append(r"\section*{Education}")
        for e in data.get("education") or []:
            if not isinstance(e, dict):
                continue
            deg = " ".join(
                x for x in [_esc(e.get("studyType")), _esc(e.get("area"))] if x
            ) or "Education"
            inst = _esc(e.get("institution") or "")
            dates = _esc(
                " -- ".join(
                    x
                    for x in [
                        str(e.get("startDate") or "").strip(),
                        str(e.get("endDate") or "").strip(),
                    ]
                    if x
                )
            )
            lines.append(rf"\textbf{{{deg}}} \hfill {dates}\\")
            if inst:
                lines.append(rf"{inst}\\")
            lines.append("")

    if _has_rows(data.get("skills")):
        lines.append(r"\section*{Skills}")
        for s in data.get("skills") or []:
            if not isinstance(s, dict):
                continue
            label = _esc(s.get("name") or "Skills")
            kw = s.get("keywords")
            if isinstance(kw, list):
                kw = ", ".join(str(k) for k in kw)
            lines.append(rf"\textbf{{{label}:}} {_esc(kw)}\\")
        lines.append("")

    if _has_rows(data.get("projects")):
        lines.append(r"\section*{Projects}")
        for p in data.get("projects") or []:
            if not isinstance(p, dict):
                continue
            pn = _esc(p.get("name") or "Project")
            lines.append(rf"\textbf{{{pn}}}\\")
            for bl in _bullets(p.get("highlights") or p.get("description") or ""):
                lines.append(r"\begin{itemize}")
                lines.append(rf"  \item {_esc(bl)}")
                lines.append(r"\end{itemize}")
            lines.append("")

    for key, title_s in (
        ("publications", "Publications"),
        ("awards", "Awards"),
        ("certifications", "Certifications"),
    ):
        if not _has_rows(data.get(key)):
            continue
        lines.append(rf"\section*{{{title_s}}}")
        for r in data.get(key) or []:
            if not isinstance(r, dict):
                continue
            nm = _esc(r.get("name") or r.get("title") or "")
            if not nm:
                continue
            date = _esc(r.get("date") or "")
            lines.append(rf"\textbf{{{nm}}}" + (rf" \hfill {date}" if date else r"") + r"\\")
            detail = _esc(r.get("summary") or r.get("description") or "")
            if detail:
                lines.append(detail + r"\\")
        lines.append("")

    lines.append(r"\end{document}")
    lines.append("")
    return "\n".join(lines)
