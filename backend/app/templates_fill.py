"""Fill template shells from structured form data (form SoT when template_id set)."""

from __future__ import annotations

from typing import Any

from app.templates_catalog import load_template_body

BODY_MARK = "% RESUMEAI:BODY"


def escape_tex(s: str) -> str:
    if not s:
        return ""
    out: list[str] = []
    for ch in s:
        if ch in "\\&%$#_{}":
            out.append("\\" + ch)
        elif ch == "~":
            out.append("\\textasciitilde{}")
        elif ch == "^":
            out.append("\\textasciicircum{}")
        else:
            out.append(ch)
    return "".join(out)


def _s(v: Any) -> str:
    return escape_tex(str(v or "").strip())


def _dates(start: Any, end: Any) -> str:
    a, b = str(start or "").strip(), str(end or "").strip()
    if a and b:
        return f"{_s(a)} -- {_s(b)}"
    return _s(a or b)


def _bullets(text: Any) -> list[str]:
    raw = str(text or "").strip()
    if not raw:
        return []
    lines = [ln.strip() for ln in raw.replace("\r\n", "\n").split("\n")]
    return [ln.lstrip("•-* ").strip() for ln in lines if ln.strip()]


def _has_rows(rows: list[Any] | None) -> bool:
    if not rows:
        return False
    for r in rows:
        if not isinstance(r, dict):
            continue
        if any(str(v or "").strip() for v in r.values()):
            return True
    return False


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


def _name(data: dict[str, Any], title: str) -> str:
    return _s(_basics(data)["name"] or title or "Name") or "Name"


def _summary(data: dict[str, Any]) -> str:
    return _s(_basics(data)["summary"])


def _contact_bits(data: dict[str, Any]) -> list[str]:
    """Plain contact fragments for center lines; omit empty (no placeholder URLs)."""
    b = _basics(data)
    bits: list[str] = []
    if b["location"]:
        bits.append(_s(b["location"]))
    if b["phone"]:
        bits.append(_s(b["phone"]))
    if b["email"]:
        bits.append(rf"\href{{mailto:{_s(b['email'])}}}{{{_s(b['email'])}}}")
    if b["linkedin"]:
        url = b["linkedin"] if b["linkedin"].startswith("http") else f"https://{b['linkedin']}"
        bits.append(rf"\href{{{_s(url)}}}{{LinkedIn}}")
    if b["github"]:
        url = b["github"] if b["github"].startswith("http") else f"https://github.com/{b['github']}"
        bits.append(rf"\href{{{_s(url)}}}{{GitHub}}")
    if b["website"]:
        url = b["website"] if b["website"].startswith("http") else f"https://{b['website']}"
        bits.append(rf"\href{{{_s(url)}}}{{Portfolio}}")
    return bits


def _extra_list_section(
    data: dict[str, Any],
    key: str,
    title: str,
    *,
    section_cmd: str = r"\section",
) -> list[str]:
    rows = data.get(key) or []
    if not _has_rows(rows):
        return []
    lines = [rf"{section_cmd}{{{title}}}", ""]
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = _s(r.get("name") or r.get("title") or "")
        if not name:
            continue
        detail = _s(r.get("summary") or r.get("description") or r.get("issuer") or "")
        date = _s(r.get("date") or r.get("releaseDate") or "")
        head = name
        if date:
            head = rf"{name} \hfill {date}"
        lines.append(rf"\textbf{{{head}}}")
        if detail:
            lines.append(detail)
        lines.append("")
    return lines


def _itemize(items: list[str], left: str = "1.5em") -> list[str]:
    if not items:
        return []
    lines = [rf"\begin{{itemize}}[leftmargin={left}, itemsep=0.2em, topsep=0.3em]"]
    for it in items:
        lines.append(rf"    \item {_s(it)}")
    lines.append(r"\end{itemize}")
    return lines


def _body_classic(data: dict[str, Any], title: str) -> str:
    lines: list[str] = []
    name, summary = _name(data, title), _summary(data)
    lines += [
        r"\begin{center}",
        rf"{{\LARGE\bfseries {name}}} \\[0.3em]",
    ]
    bits = _contact_bits(data)
    if bits:
        lines.append(r" $|$ ".join(bits))
    lines.append(r"\end{center}")
    if summary:
        lines += [r"\section{Professional Summary}", "", summary, ""]
    work = data.get("work") or []
    if _has_rows(work):
        lines += [r"\section{Experience}", ""]
        for w in work:
            if not isinstance(w, dict):
                continue
            role = _s(w.get("position") or "Role")
            co = _s(w.get("name") or "")
            dates = _dates(w.get("startDate"), w.get("endDate"))
            lines.append(rf"\entry{{{role}}}{{{dates}}}{{{co}}}{{}}")
            lines.extend(_itemize(_bullets(w.get("summary"))))
            lines += [r"\vspace{0.5em}", ""]
    edu = data.get("education") or []
    if _has_rows(edu):
        lines += [r"\section{Education}", ""]
        for e in edu:
            if not isinstance(e, dict):
                continue
            deg = " ".join(
                x for x in [_s(e.get("studyType")), _s(e.get("area"))] if x
            ) or "Education"
            inst = _s(e.get("institution"))
            dates = _dates(e.get("startDate"), e.get("endDate"))
            lines.append(rf"\entry{{{deg}}}{{{dates}}}{{{inst}}}{{}}")
            lines.append("")
    skills = data.get("skills") or []
    if _has_rows(skills):
        lines += [r"\section{Skills}", ""]
        for s in skills:
            if not isinstance(s, dict):
                continue
            kw = s.get("keywords")
            if isinstance(kw, list):
                kw = ", ".join(str(k) for k in kw)
            label = _s(s.get("name") or "Skills")
            lines.append(rf"\textbf{{{label}:}} {_s(kw)} \\")
        lines.append("")
    projects = data.get("projects") or []
    if _has_rows(projects):
        lines += [r"\section{Projects}", ""]
        for p in projects:
            if not isinstance(p, dict):
                continue
            pn = _s(p.get("name") or "Project")
            lines.append(rf"\textbf{{{pn}}}")
            desc = p.get("description") or p.get("summary") or ""
            hl = _bullets(p.get("highlights") or desc)
            if hl:
                lines.extend(_itemize(hl))
            elif _s(desc):
                lines.append(_s(desc))
            lines.append("")
    lines.extend(_extra_list_section(data, "publications", "Publications"))
    lines.extend(_extra_list_section(data, "awards", "Awards"))
    lines.extend(_extra_list_section(data, "certifications", "Certifications"))
    return "\n".join(lines) + "\n"


def _body_entry_level(data: dict[str, Any], title: str) -> str:
    lines: list[str] = []
    name = _name(data, title)
    lines += [
        r"\begin{center}",
        rf"{{\LARGE\textbf{{{name}}}}} \\",
        r"\vspace{0.3em}",
    ]
    b = _basics(data)
    parts: list[str] = []
    if b["location"]:
        parts.append(rf"\faMapMarker*\ {_s(b['location'])}")
    if b["phone"]:
        parts.append(rf"\faPhone*\ {_s(b['phone'])}")
    if b["email"]:
        parts.append(
            rf"\faEnvelope\ \href{{mailto:{_s(b['email'])}}}{{{_s(b['email'])}}}"
        )
    if b["linkedin"]:
        url = b["linkedin"] if b["linkedin"].startswith("http") else f"https://{b['linkedin']}"
        parts.append(rf"\faLinkedin\ \href{{{_s(url)}}}{{LinkedIn}}")
    if b["github"]:
        url = (
            b["github"]
            if b["github"].startswith("http")
            else f"https://github.com/{b['github']}"
        )
        parts.append(rf"\faGithub\ \href{{{_s(url)}}}{{GitHub}}")
    if b["website"]:
        url = b["website"] if b["website"].startswith("http") else f"https://{b['website']}"
        parts.append(rf"\faGlobe\ \href{{{_s(url)}}}{{Portfolio}}")
    if parts:
        lines.append(r" $|$ ".join(parts))
    lines += [r"\end{center}", r"\vspace{0.5em}", ""]
    edu = data.get("education") or []
    if _has_rows(edu):
        lines += [r"\resumesection{Education}", ""]
        for e in edu:
            if not isinstance(e, dict):
                continue
            deg = " ".join(
                x for x in [_s(e.get("studyType")), _s(e.get("area"))] if x
            ) or "Education"
            dates = _dates(e.get("startDate"), e.get("endDate"))
            inst = _s(e.get("institution"))
            lines.append(rf"\educationentry{{{deg}}}{{{dates}}}{{{inst}}}{{}}")
            lines.append("")
    work = data.get("work") or []
    if _has_rows(work):
        lines += [r"\resumesection{Relevant Experience}", ""]
        for w in work:
            if not isinstance(w, dict):
                continue
            role = _s(w.get("position") or "Role")
            dates = _dates(w.get("startDate"), w.get("endDate"))
            co = _s(w.get("name") or "")
            lines.append(rf"\experienceentry{{{role}}}{{{dates}}}{{{co}}}{{}}")
            lines.extend(_itemize(_bullets(w.get("summary")), left="*"))
            lines.append("")
    projects = data.get("projects") or []
    if _has_rows(projects):
        lines += [r"\resumesection{Projects}", ""]
        for p in projects:
            if not isinstance(p, dict):
                continue
            pn = _s(p.get("name") or "Project")
            url = _s(p.get("url") or "")
            lines.append(rf"\projectentry{{{pn}}}{{{url}}}{{}}")
            desc = p.get("description") or p.get("summary") or ""
            hl = _bullets(p.get("highlights") or desc)
            lines.extend(_itemize(hl, left="*"))
            lines.append("")
    skills = data.get("skills") or []
    if _has_rows(skills):
        lines += [r"\resumesection{Technical Skills}", ""]
        for s in skills:
            if not isinstance(s, dict):
                continue
            kw = s.get("keywords")
            if isinstance(kw, list):
                kw = ", ".join(str(k) for k in kw)
            lines.append(rf"\textbf{{{_s(s.get('name') or 'Skills')}:}} {_s(kw)}")
            lines.append("")
    summary = _summary(data)
    if summary:
        lines += [r"\resumesection{Summary}", "", summary, ""]
    lines.extend(
        _extra_list_section(data, "awards", "Awards", section_cmd=r"\resumesection")
    )
    lines.extend(
        _extra_list_section(
            data, "certifications", "Certifications", section_cmd=r"\resumesection"
        )
    )
    return "\n".join(lines) + "\n"


def _body_executive(data: dict[str, Any], title: str) -> str:
    lines: list[str] = []
    name, summary = _name(data, title), _summary(data)
    lines += [
        r"\begin{center}",
        rf"{{\LARGE\bfseries\color{{navy}} {name}}} \\[0.2em]",
    ]
    bits = _contact_bits(data)
    if bits:
        lines.append(rf"{{\small {' $|$ '.join(bits)}}}")
    lines.append(r"\end{center}")
    if summary:
        lines += [r"\section{Executive Summary}", "", summary, ""]
    skills = data.get("skills") or []
    if _has_rows(skills):
        lines += [r"\section{Core Competencies}", ""]
        bits = []
        for s in skills:
            if not isinstance(s, dict):
                continue
            kw = s.get("keywords")
            if isinstance(kw, list):
                bits.extend(str(k) for k in kw if k)
            elif kw:
                bits.append(str(kw))
            elif s.get("name"):
                bits.append(str(s["name"]))
        if bits:
            lines.append(
                r"\noindent\textbf{"
                + r" \,\textbar\, ".join(_s(b) for b in bits[:12])
                + r"}"
            )
            lines.append("")
    work = data.get("work") or []
    if _has_rows(work):
        lines += [r"\section{Leadership Experience}", ""]
        for w in work:
            if not isinstance(w, dict):
                continue
            role = _s(w.get("position") or "Role")
            dates = _dates(w.get("startDate"), w.get("endDate"))
            co = _s(w.get("name") or "")
            lines.append(rf"\entry{{{role}}}{{{dates}}}{{{co}}}{{}}")
            lines.extend(_itemize(_bullets(w.get("summary"))))
            lines += [r"\vspace{0.5em}", ""]
    edu = data.get("education") or []
    if _has_rows(edu):
        lines += [r"\section{Education}", ""]
        for e in edu:
            if not isinstance(e, dict):
                continue
            deg = " ".join(
                x for x in [_s(e.get("studyType")), _s(e.get("area"))] if x
            ) or "Education"
            dates = _dates(e.get("startDate"), e.get("endDate"))
            inst = _s(e.get("institution"))
            lines.append(rf"\entry{{{deg}}}{{{dates}}}{{{inst}}}{{}}")
            lines.append("")
    projects = data.get("projects") or []
    if _has_rows(projects):
        lines += [r"\section{Selected Initiatives}", ""]
        for p in projects:
            if not isinstance(p, dict):
                continue
            pn = _s(p.get("name") or "Initiative")
            lines.append(rf"\textbf{{{pn}}}")
            hl = _bullets(p.get("highlights") or p.get("description") or "")
            lines.extend(_itemize(hl))
            lines.append("")
    lines.extend(_extra_list_section(data, "publications", "Publications"))
    lines.extend(_extra_list_section(data, "awards", "Awards"))
    lines.extend(_extra_list_section(data, "certifications", "Certifications"))
    return "\n".join(lines) + "\n"


def _body_modern(data: dict[str, Any], title: str) -> str:
    lines: list[str] = []
    name, summary = _name(data, title), _summary(data)
    lines += [
        r"\begin{center}",
        rf"{{\huge\bfseries\color{{accent}} {name}}} \\[0.4em]",
    ]
    bits = _contact_bits(data)
    if bits:
        lines.append(rf"{{\small {' $|$ '.join(bits)}}}")
    lines.append(r"\end{center}")
    if summary:
        lines += [r"\section{Professional Summary}", "", summary, ""]
    skills = data.get("skills") or []
    if _has_rows(skills):
        lines += [r"\section{Core Competencies}", ""]
        tags: list[str] = []
        for s in skills:
            if not isinstance(s, dict):
                continue
            kw = s.get("keywords")
            if isinstance(kw, list):
                tags.extend(str(k) for k in kw if k)
            elif s.get("name"):
                tags.append(str(s["name"]))
        if tags:
            parts = [rf"\skill{{{_s(t)}}}" for t in tags[:10]]
            lines.append(r" \enspace\textbar\enspace ".join(parts))
            lines.append("")
    work = data.get("work") or []
    if _has_rows(work):
        lines += [r"\section{Professional Experience}", ""]
        for w in work:
            if not isinstance(w, dict):
                continue
            role = _s(w.get("position") or "Role")
            dates = _dates(w.get("startDate"), w.get("endDate"))
            co = _s(w.get("name") or "")
            lines.append(rf"\entry{{{role}}}{{{dates}}}{{{co}}}{{}}")
            lines.extend(_itemize(_bullets(w.get("summary"))))
            lines += [r"\vspace{0.5em}", ""]
    edu = data.get("education") or []
    if _has_rows(edu):
        lines += [r"\section{Education}", ""]
        for e in edu:
            if not isinstance(e, dict):
                continue
            deg = " ".join(
                x for x in [_s(e.get("studyType")), _s(e.get("area"))] if x
            ) or "Education"
            dates = _dates(e.get("startDate"), e.get("endDate"))
            inst = _s(e.get("institution"))
            lines.append(rf"\entry{{{deg}}}{{{dates}}}{{{inst}}}{{}}")
            lines.append("")
    projects = data.get("projects") or []
    if _has_rows(projects):
        lines += [r"\section{Projects}", ""]
        for p in projects:
            if not isinstance(p, dict):
                continue
            pn = _s(p.get("name") or "Project")
            lines.append(rf"\textbf{{{pn}}}")
            hl = _bullets(p.get("highlights") or p.get("description") or "")
            lines.extend(_itemize(hl))
            lines.append("")
    lines.extend(_extra_list_section(data, "publications", "Publications"))
    lines.extend(_extra_list_section(data, "awards", "Awards"))
    lines.extend(_extra_list_section(data, "certifications", "Certifications"))
    return "\n".join(lines) + "\n"


def _body_technical(data: dict[str, Any], title: str) -> str:
    lines: list[str] = []
    name = _name(data, title)
    lines.append(rf"\name{{{name}}}")
    # Build contact only from filled fields — never placeholder URLs
    b = _basics(data)
    parts: list[str] = []
    if b["location"]:
        parts.append(rf"\faMapMarker*\ {_s(b['location'])}")
    if b["phone"]:
        parts.append(rf"\faPhone*\ {_s(b['phone'])}")
    if b["email"]:
        parts.append(
            rf"\faEnvelope\ \href{{mailto:{_s(b['email'])}}}{{{_s(b['email'])}}}"
        )
    if b["linkedin"]:
        url = b["linkedin"] if b["linkedin"].startswith("http") else f"https://{b['linkedin']}"
        parts.append(rf"\faLinkedin\ \href{{{_s(url)}}}{{LinkedIn}}")
    if b["github"]:
        url = (
            b["github"]
            if b["github"].startswith("http")
            else f"https://github.com/{b['github']}"
        )
        parts.append(rf"\faGithub\ \href{{{_s(url)}}}{{GitHub}}")
    if parts:
        lines += [
            r"\begin{center}",
            r" $|$ ".join(parts),
            r"\end{center}",
            r"\vspace{-5pt}",
        ]
    skills = data.get("skills") or []
    if _has_rows(skills):
        lines += [r"\section*{Technical Skills}", ""]
        for s in skills:
            if not isinstance(s, dict):
                continue
            kw = s.get("keywords")
            if isinstance(kw, list):
                kw = ", ".join(str(k) for k in kw)
            lines.append(
                rf"\textbf{{{_s(s.get('name') or 'Skills')}:}} {_s(kw)}"
            )
            lines.append("")
    work = data.get("work") or []
    if _has_rows(work):
        lines += [r"\section*{Professional Experience}", ""]
        for w in work:
            if not isinstance(w, dict):
                continue
            role = _s(w.get("position") or "Role")
            dates = _dates(w.get("startDate"), w.get("endDate"))
            co = _s(w.get("name") or "")
            lines.append(rf"\jobheader{{{role}}}{{{dates}}}{{{co}}}{{}}")
            lines.append(r"\begin{itemize}")
            for bl in _bullets(w.get("summary")):
                lines.append(rf"  \item {_s(bl)}")
            lines.append(r"\end{itemize}")
            lines.append("")
    projects = data.get("projects") or []
    if _has_rows(projects):
        lines += [r"\section*{Projects}", ""]
        for p in projects:
            if not isinstance(p, dict):
                continue
            pn = _s(p.get("name") or "Project")
            url = _s(p.get("url") or "")
            lines.append(rf"\projectheader{{{pn}}}{{{url}}}")
            lines.append(r"\begin{itemize}")
            for bl in _bullets(p.get("highlights") or p.get("description") or ""):
                lines.append(rf"  \item {_s(bl)}")
            lines.append(r"\end{itemize}")
            lines.append("")
    edu = data.get("education") or []
    if _has_rows(edu):
        lines += [r"\section*{Education}", ""]
        for e in edu:
            if not isinstance(e, dict):
                continue
            deg = " ".join(
                x for x in [_s(e.get("studyType")), _s(e.get("area"))] if x
            ) or "Education"
            dates = _dates(e.get("startDate"), e.get("endDate"))
            inst = _s(e.get("institution"))
            lines.append(rf"\educationheader{{{deg}}}{{{dates}}}{{{inst}}}{{}}")
            lines.append("")
    summary = _summary(data)
    if summary:
        lines += [r"\section*{Summary}", "", summary, ""]
    lines.extend(
        _extra_list_section(
            data, "publications", "Publications", section_cmd=r"\section*"
        )
    )
    lines.extend(
        _extra_list_section(
            data, "certifications", "Certifications", section_cmd=r"\section*"
        )
    )
    return "\n".join(lines) + "\n"


_RENDERERS = {
    "resume-classic-ats": _body_classic,
    "resume-entry-level": _body_entry_level,
    "resume-executive": _body_executive,
    "resume-modern-professional": _body_modern,
    "resume-technical": _body_technical,
}


def render_body(template_id: str, data: dict[str, Any] | None, *, title: str = "") -> str:
    tid = (template_id or "").strip()
    fn = _RENDERERS.get(tid, _body_classic)
    return fn(data or {}, title)


def render_template(
    template_id: str, data: dict[str, Any] | None, *, title: str = ""
) -> str:
    shell = load_template_body(template_id)
    if BODY_MARK not in shell:
        # ponytail: if shell missing marker, fall back to classic body only document
        body = render_body(template_id, data, title=title)
        return (
            r"\documentclass{article}\begin{document}"
            + "\n"
            + body
            + r"\end{document}"
            + "\n"
        )
    body = render_body(template_id, data, title=title)
    return shell.replace(BODY_MARK, body, 1)
