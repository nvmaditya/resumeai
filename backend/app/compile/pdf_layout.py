"""Valid multi-page PDF resume layout (stdlib only).

Root cause of "corrupt" downloads: previous stub was not a valid PDF (no pages/xref).
This writer builds a real PDF 1.4 with letter pages, margins, and text wrapping.
# ponytail: Helvetica only, not full LaTeX; upgrade to tectonic when real .tex fidelity needed.
"""

from __future__ import annotations

from typing import Any

# US Letter points
PAGE_W = 612.0
PAGE_H = 792.0
MARGIN_L = 54.0  # 0.75"
MARGIN_R = 54.0
MARGIN_T = 54.0
MARGIN_B = 54.0
LINE_BODY = 13.0
LINE_HEAD = 16.0
LINE_TITLE = 22.0
GAP_SECTION = 10.0
CHAR_W_BODY = 0.5 * 11  # Helvetica ~0.5em at 11pt
CHAR_W_HEAD = 0.52 * 12
CHAR_W_TITLE = 0.55 * 18


def _pdf_escape(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\r", "")
    )


def _wrap(text: str, max_chars: int) -> list[str]:
    text = " ".join((text or "").replace("\t", " ").split())
    if not text:
        return []
    words = text.split(" ")
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if len(trial) <= max_chars:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            # hard-break long tokens
            while len(w) > max_chars:
                lines.append(w[:max_chars])
                w = w[max_chars:]
            cur = w
    if cur:
        lines.append(cur)
    return lines


def structured_to_blocks(data: dict[str, Any] | None, title: str) -> list[tuple[str, str]]:
    """Return list of (style, text) style in title|h1|body|muted."""
    blocks: list[tuple[str, str]] = []
    data = data or {}
    basics = data.get("basics") or {}
    name = (basics.get("name") or title or "Resume").strip()
    blocks.append(("title", name))
    contact = " · ".join(
        x for x in [basics.get("email") or "", basics.get("phone") or "", basics.get("url") or ""] if x
    )
    if contact:
        blocks.append(("muted", contact))
    if basics.get("summary"):
        blocks.append(("h1", "Summary"))
        blocks.append(("body", str(basics["summary"])))

    work = data.get("work") or []
    if work:
        blocks.append(("h1", "Experience"))
        for w in work:
            head = " — ".join(
                x for x in [w.get("position") or "", w.get("name") or ""] if x
            ) or "Role"
            dates = " – ".join(x for x in [w.get("startDate") or "", w.get("endDate") or ""] if x)
            blocks.append(("body", f"{head}" + (f"  ({dates})" if dates else "")))
            if w.get("summary"):
                blocks.append(("body", str(w["summary"])))

    edu = data.get("education") or []
    if edu:
        blocks.append(("h1", "Education"))
        for e in edu:
            line = ", ".join(
                x for x in [e.get("studyType") or "", e.get("area") or "", e.get("institution") or ""] if x
            )
            if line:
                blocks.append(("body", line))

    skills = data.get("skills") or []
    if skills:
        blocks.append(("h1", "Skills"))
        for s in skills:
            kw = s.get("keywords")
            if isinstance(kw, list):
                kw = ", ".join(str(k) for k in kw)
            line = f"{s.get('name') or 'Skills'}: {kw or ''}".strip(": ")
            blocks.append(("body", line))

    projects = data.get("projects") or []
    if projects:
        blocks.append(("h1", "Projects"))
        for p in projects:
            name_p = p.get("name") or "Project"
            url = p.get("url") or ""
            blocks.append(("body", f"{name_p}" + (f" — {url}" if url else "")))
            desc = p.get("description") or p.get("summary") or ""
            if desc:
                blocks.append(("body", str(desc)))
            hl = p.get("highlights")
            if isinstance(hl, list):
                for h in hl:
                    blocks.append(("body", f"• {h}"))
            elif isinstance(hl, str) and hl.strip():
                for h in hl.split("\n"):
                    if h.strip():
                        blocks.append(("body", f"• {h.strip()}"))
    return blocks


def latex_to_blocks(tex: str, title: str) -> list[tuple[str, str]]:
    """Naive LaTeX → text blocks (not a full TeX engine)."""
    import re

    text = tex or ""
    text = re.sub(r"%.*?$", "", text, flags=re.M)
    text = re.sub(r"\\begin\{document\}|\\end\{document\}|\\documentclass\{.*?\}", "", text)
    text = re.sub(r"\\section\*?\{([^}]*)\}", r"\n\n## \1\n", text)
    text = re.sub(r"\\subsection\*?\{([^}]*)\}", r"\n# \1\n", text)
    text = re.sub(r"\\textbf\{([^}]*)\}", r"\1", text)
    text = re.sub(r"\\emph\{([^}]*)\}|\\textit\{([^}]*)\}", lambda m: m.group(1) or m.group(2) or "", text)
    text = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?", " ", text)
    text = text.replace("{", " ").replace("}", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    blocks: list[tuple[str, str]] = [("title", title or "Resume")]
    for para in text.split("\n"):
        p = para.strip()
        if not p:
            continue
        if p.startswith("## "):
            blocks.append(("h1", p[3:].strip()))
        elif p.startswith("# "):
            blocks.append(("body", p[2:].strip()))
        else:
            blocks.append(("body", p))
    if len(blocks) == 1:
        blocks.append(("body", "(empty document)"))
    return blocks


def _layout_pages(blocks: list[tuple[str, str]]) -> list[list[str]]:
    """Convert blocks to PDF content-stream command lists per page."""
    usable_w = PAGE_W - MARGIN_L - MARGIN_R
    max_body = max(20, int(usable_w / CHAR_W_BODY))
    max_head = max(16, int(usable_w / CHAR_W_HEAD))
    max_title = max(12, int(usable_w / CHAR_W_TITLE))

    pages: list[list[str]] = []
    cmds: list[str] = []
    y = PAGE_H - MARGIN_T

    def new_page() -> None:
        nonlocal cmds, y
        if cmds:
            pages.append(cmds)
        cmds = []
        y = PAGE_H - MARGIN_T

    def ensure(space: float) -> None:
        nonlocal y
        if y - space < MARGIN_B:
            new_page()

    def draw_line(text: str, size: float, y_pos: float, font: str = "F1") -> str:
        return (
            f"BT /{font} {size:.1f} Tf 1 0 0 1 {MARGIN_L:.1f} {y_pos:.1f} Tm "
            f"({_pdf_escape(text)}) Tj ET"
        )

    for style, raw in blocks:
        if style == "title":
            ensure(LINE_TITLE + 8)
            for line in _wrap(raw, max_title) or [raw[:max_title]]:
                ensure(LINE_TITLE)
                y -= LINE_TITLE
                cmds.append(draw_line(line, 18, y, "F2"))
            y -= 6
        elif style == "h1":
            y -= GAP_SECTION
            ensure(LINE_HEAD + 4)
            for line in _wrap(raw.upper(), max_head) or [raw.upper()[:max_head]]:
                ensure(LINE_HEAD)
                y -= LINE_HEAD
                cmds.append(draw_line(line, 12, y, "F2"))
            # underline rule
            y -= 2
            cmds.append(
                f"q 0.7 0.7 0.7 RG 0.6 w {MARGIN_L:.1f} {y:.1f} m "
                f"{PAGE_W - MARGIN_R:.1f} {y:.1f} l S Q"
            )
            y -= 6
        elif style == "muted":
            ensure(LINE_BODY)
            for line in _wrap(raw, max_body):
                ensure(LINE_BODY)
                y -= LINE_BODY
                cmds.append(draw_line(line, 10, y, "F1"))
            y -= 4
        else:  # body
            for line in _wrap(raw, max_body):
                ensure(LINE_BODY)
                y -= LINE_BODY
                cmds.append(draw_line(line, 11, y, "F1"))
            y -= 3

    if cmds:
        pages.append(cmds)
    if not pages:
        pages = [[draw_line("Empty resume", 12, PAGE_H - MARGIN_T - 20, "F1")]]
    return pages


def build_pdf(blocks: list[tuple[str, str]]) -> bytes:
    pages_cmds = _layout_pages(blocks)
    # Object IDs: 1=Catalog 2=Pages 3=F1 4=F2 then pairs of Page+Content per page
    objs: dict[int, bytes] = {}
    objs[3] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objs[4] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

    page_ids: list[int] = []
    next_id = 5
    for cmds in pages_cmds:
        stream = "\n".join(cmds).encode("latin-1", errors="replace")
        content_id = next_id
        page_id = next_id + 1
        next_id += 2
        objs[content_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"
        )
        objs[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W:.0f} {PAGE_H:.0f}] "
            f"/Contents {content_id} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>"
        ).encode()
        page_ids.append(page_id)

    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objs[2] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
    objs[1] = b"<< /Type /Catalog /Pages 2 0 R >>"

    # Assemble with xref
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {0: 0}
    for i in sorted(objs):
        offsets[i] = len(out)
        out += f"{i} 0 obj\n".encode()
        out += objs[i]
        out += b"\nendobj\n"

    xref_pos = len(out)
    max_id = max(objs)
    out += f"xref\n0 {max_id + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for i in range(1, max_id + 1):
        out += f"{offsets[i]:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {max_id + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    ).encode()
    return bytes(out)


def render_resume_pdf(
    *,
    title: str,
    track: str,
    latex: str | None = None,
    structured: dict[str, Any] | None = None,
) -> bytes:
    if track == "structured" or structured:
        blocks = structured_to_blocks(structured, title)
    else:
        blocks = latex_to_blocks(latex or "", title)
    return build_pdf(blocks)
