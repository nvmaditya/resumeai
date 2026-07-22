"""Real LaTeX compile via tectonic with SyncTeX artifacts."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from app.compile.pdf_layout import render_resume_pdf
from app.compile.synctex import ensure_synctex_preamble


def resolve_tectonic(tectonic_path: str | None = None) -> Path | None:
    if tectonic_path:
        p = Path(tectonic_path)
        if p.is_file():
            return p
    local = Path(__file__).resolve().parents[2] / "bin" / "tectonic.exe"
    if local.is_file():
        return local
    local2 = Path(__file__).resolve().parents[2] / "bin" / "tectonic"
    if local2.is_file():
        return local2
    which = shutil.which("tectonic") or shutil.which("tectonic.exe")
    return Path(which) if which else None


def structured_to_tex(title: str, data: dict[str, Any] | None) -> str:
    data = data or {}
    basics = data.get("basics") or {}
    name = (basics.get("name") or title or "Resume").replace("&", "\\&")
    email = (basics.get("email") or "").replace("&", "\\&")
    summary = (basics.get("summary") or "").replace("&", "\\&")
    lines = [
        r"\documentclass[11pt,letterpaper]{article}",
        r"\synctex=1",
        r"\usepackage[margin=0.75in]{geometry}",
        r"\usepackage[T1]{fontenc}",
        r"\usepackage{lmodern}",
        r"\usepackage{hyperref}",
        r"\usepackage{enumitem}",
        r"\setlist{nosep,leftmargin=*}",
        r"\pagestyle{empty}",
        r"\begin{document}",
        r"\begin{center}",
        r"{\Large\bfseries " + name + r"}\\[0.3em]",
    ]
    if email:
        lines.append(email + r"\\")
    lines.append(r"\end{center}")
    if summary:
        lines += [r"\section*{Summary}", summary]
    work = data.get("work") or []
    if work:
        lines.append(r"\section*{Experience}")
        lines.append(r"\begin{itemize}")
        for w in work:
            role = (w.get("position") or "").replace("&", "\\&")
            co = (w.get("name") or "").replace("&", "\\&")
            sm = (w.get("summary") or "").replace("&", "\\&")
            dates = " -- ".join(x for x in [w.get("startDate") or "", w.get("endDate") or ""] if x)
            head = " at ".join(x for x in [role, co] if x) or "Role"
            lines.append(r"\item \textbf{" + head + "}" + (f" ({dates})" if dates else ""))
            if sm:
                lines.append(r"\\ " + sm)
        lines.append(r"\end{itemize}")
    edu = data.get("education") or []
    if edu:
        lines.append(r"\section*{Education}")
        lines.append(r"\begin{itemize}")
        for e in edu:
            bit = ", ".join(
                x.replace("&", "\\&")
                for x in [e.get("studyType") or "", e.get("area") or "", e.get("institution") or ""]
                if x
            )
            if bit:
                lines.append(r"\item " + bit)
        lines.append(r"\end{itemize}")
    skills = data.get("skills") or []
    if skills:
        lines.append(r"\section*{Skills}")
        lines.append(r"\begin{itemize}")
        for s in skills:
            kw = s.get("keywords")
            if isinstance(kw, list):
                kw = ", ".join(str(k) for k in kw)
            lines.append(
                r"\item \textbf{"
                + (s.get("name") or "Skills").replace("&", "\\&")
                + r":} "
                + str(kw or "").replace("&", "\\&")
            )
        lines.append(r"\end{itemize}")
    projects = data.get("projects") or []
    if projects:
        lines.append(r"\section*{Projects}")
        lines.append(r"\begin{itemize}")
        for p in projects:
            pn = (p.get("name") or "Project").replace("&", "\\&")
            desc = (p.get("description") or p.get("summary") or "").replace("&", "\\&")
            lines.append(r"\item \textbf{" + pn + r"}")
            if desc:
                lines.append(r"\\ " + desc)
        lines.append(r"\end{itemize}")
    lines.append(r"\end{document}")
    return "\n".join(lines) + "\n"


class TectonicCompiler:
    def __init__(self, binary: Path, timeout_s: int = 120) -> None:
        self.binary = binary
        self.timeout_s = timeout_s

    def compile(
        self,
        *args: Any,
        title: str = "Resume",
        track: str = "latex",
        latex: str | None = None,
        structured: dict[str, Any] | None = None,
        work_dir: Path | str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        tex_bytes = kwargs.get("tex_bytes")
        if args and latex is None and tex_bytes is None:
            tex_bytes = args[0]
        if tex_bytes is not None and latex is None:
            latex = (
                tex_bytes.decode("utf-8", errors="replace")
                if isinstance(tex_bytes, (bytes, bytearray))
                else str(tex_bytes)
            )

        if track == "structured" or (structured and not latex):
            source = structured_to_tex(title, structured)
        else:
            source = latex or r"\documentclass{article}\begin{document}Empty\end{document}"
        source = ensure_synctex_preamble(source)

        if work_dir is None:
            import tempfile

            tmp = tempfile.mkdtemp(prefix="resumeai-tex-")
            work = Path(tmp)
        else:
            work = Path(work_dir)
            work.mkdir(parents=True, exist_ok=True)

        tex_path = work / "main.tex"
        tex_path.write_text(source, encoding="utf-8")
        try:
            proc = subprocess.run(
                [str(self.binary), str(tex_path)],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=self.timeout_s,
            )
        except subprocess.TimeoutExpired:
            return self._fallback(title, track, latex, structured, "tectonic timeout")
        except FileNotFoundError:
            return self._fallback(title, track, latex, structured, "tectonic not found")

        pdf_path = work / "main.pdf"
        if not pdf_path.exists():
            pdfs = list(work.glob("*.pdf"))
            pdf_path = pdfs[0] if pdfs else pdf_path

        if proc.returncode != 0 or not pdf_path.exists():
            err = (proc.stderr or proc.stdout or "compile failed")[-2000:]
            return self._fallback(title, track, latex, structured, err)

        data = pdf_path.read_bytes()
        synctex = work / "main.synctex.gz"
        if not synctex.exists():
            synctex = work / "main.synctex"
        return {
            "ok": True,
            "message": "compiled with tectonic (+synctex)",
            "pdf_bytes": data,
            "bytes": len(data),
            "engine": "tectonic",
            "work_dir": str(work.resolve()),
            "tex_path": str(tex_path.resolve()),
            "pdf_path": str(pdf_path.resolve()),
            "synctex_path": str(synctex.resolve()) if synctex.exists() else None,
            "synctex": synctex.exists(),
        }

    def _fallback(
        self,
        title: str,
        track: str,
        latex: str | None,
        structured: dict[str, Any] | None,
        reason: str,
    ) -> dict[str, Any]:
        pdf = render_resume_pdf(title=title, track=track, latex=latex, structured=structured)
        return {
            "ok": True,
            "message": f"layout fallback (no SyncTeX): {reason[:300]}",
            "pdf_bytes": pdf,
            "bytes": len(pdf),
            "engine": "layout",
            "synctex": False,
        }


class LayoutCompiler:
    def compile(
        self,
        *args: Any,
        title: str = "Resume",
        track: str = "latex",
        latex: str | None = None,
        structured: dict[str, Any] | None = None,
        work_dir: Path | str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        tex_bytes = kwargs.get("tex_bytes")
        if args and latex is None and tex_bytes is None:
            tex_bytes = args[0]
        if tex_bytes is not None and latex is None:
            latex = (
                tex_bytes.decode("utf-8", errors="replace")
                if isinstance(tex_bytes, (bytes, bytearray))
                else str(tex_bytes)
            )
        pdf = render_resume_pdf(title=title, track=track, latex=latex, structured=structured)
        return {
            "ok": True,
            "message": "layout fallback (install tectonic for Overleaf-like output)",
            "pdf_bytes": pdf,
            "bytes": len(pdf),
            "engine": "layout",
            "synctex": False,
            "work_dir": str(work_dir) if work_dir else None,
        }


def build_compiler(tectonic_path: str | None = None):
    binary = resolve_tectonic(tectonic_path)
    if binary:
        return TectonicCompiler(binary)
    return LayoutCompiler()
