"""Static + tectonic LaTeX diagnostics for editor debugging."""

from __future__ import annotations

import re
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class Diagnostic:
    line: int | None
    severity: str  # error | warning
    message: str
    source: str  # static | tectonic

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_BEGIN_RE = re.compile(r"\\begin\{([^}]+)\}")
_END_RE = re.compile(r"\\end\{([^}]+)\}")
# tectonic / latex-style: file.tex:12: message  or  l.12
_LINE_RE = re.compile(r"(?:^|:|\s)(?:l\.)?(\d+):", re.MULTILINE)
_TEX_LINE_RE = re.compile(r"\.tex:(\d+):")


def _strip_comment(line: str) -> str:
    # crude: % starts comment unless \%
    out: list[str] = []
    i = 0
    while i < len(line):
        if line[i] == "%" and (i == 0 or line[i - 1] != "\\"):
            break
        out.append(line[i])
        i += 1
    return "".join(out)


def lint_static(source: str) -> list[Diagnostic]:
    text = source or ""
    diags: list[Diagnostic] = []
    has_dc = "\\documentclass" in text
    has_begin = "\\begin{document}" in text
    has_end = "\\end{document}" in text
    if has_dc or has_begin or has_end:
        if not has_dc:
            diags.append(
                Diagnostic(None, "error", "missing \\documentclass", "static")
            )
        if not has_begin:
            diags.append(
                Diagnostic(None, "error", "missing \\begin{document}", "static")
            )
        if not has_end:
            diags.append(
                Diagnostic(None, "error", "missing \\end{document}", "static")
            )

    stack: list[tuple[str, int]] = []
    brace = 0
    dollar_count = 0
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = _strip_comment(raw)
        for m in _BEGIN_RE.finditer(line):
            stack.append((m.group(1), lineno))
        for m in _END_RE.finditer(line):
            name = m.group(1)
            if not stack:
                diags.append(
                    Diagnostic(
                        lineno,
                        "error",
                        f"\\end{{{name}}} without matching \\begin",
                        "static",
                    )
                )
            else:
                top, start = stack.pop()
                if top != name:
                    diags.append(
                        Diagnostic(
                            lineno,
                            "error",
                            f"\\end{{{name}}} does not match \\begin{{{top}}} (line {start})",
                            "static",
                        )
                    )
        i = 0
        while i < len(line):
            c = line[i]
            if c == "\\" and i + 1 < len(line):
                nxt = line[i + 1]
                if nxt in "{}":
                    i += 2
                    continue
                if nxt == "$":
                    i += 2
                    continue
            if c == "{":
                brace += 1
            elif c == "}":
                brace -= 1
                if brace < 0:
                    diags.append(
                        Diagnostic(lineno, "error", "extra closing brace }", "static")
                    )
                    brace = 0
            elif c == "$":
                dollar_count += 1
            i += 1

    for name, start in stack:
        diags.append(
            Diagnostic(
                start,
                "error",
                f"unclosed \\begin{{{name}}}",
                "static",
            )
        )
    if brace > 0:
        diags.append(
            Diagnostic(None, "error", f"unbalanced braces: {brace} unclosed {{", "static")
        )
    if dollar_count % 2 == 1:
        diags.append(
            Diagnostic(None, "warning", "odd number of $ (possible unclosed math)", "static")
        )
    return diags


def _parse_tectonic_log(log: str) -> list[Diagnostic]:
    diags: list[Diagnostic] = []
    if not log or not log.strip():
        return [
            Diagnostic(None, "error", "tectonic failed with empty log", "tectonic")
        ]
    for line in log.splitlines():
        line = line.strip()
        if not line:
            continue
        low = line.lower()
        if not any(
            k in low
            for k in ("error", "warning", "! ", "undefined", "missing", "emergency")
        ):
            continue
        m = _TEX_LINE_RE.search(line) or _LINE_RE.search(line)
        ln = int(m.group(1)) if m else None
        sev = "warning" if "warning" in low and "error" not in low else "error"
        diags.append(Diagnostic(ln, sev, line[:500], "tectonic"))
        if len(diags) >= 30:
            break
    if not diags:
        tail = log.strip()[-800:]
        diags.append(Diagnostic(None, "error", tail, "tectonic"))
    return diags


def lint_compile_tectonic(source: str, binary: Path, timeout_s: int = 90) -> list[Diagnostic]:
    """Run tectonic without layout fallback — real engine errors only."""
    text = source or ""
    with tempfile.TemporaryDirectory(prefix="resumeai-lint-") as tmp:
        work = Path(tmp)
        tex = work / "main.tex"
        tex.write_text(text, encoding="utf-8", newline="\n")
        try:
            proc = subprocess.run(
                [str(binary), "main.tex"],
                cwd=str(work),
                capture_output=True,
                text=True,
                timeout=timeout_s,
            )
        except subprocess.TimeoutExpired:
            return [Diagnostic(None, "error", "tectonic timeout", "tectonic")]
        except FileNotFoundError:
            return [Diagnostic(None, "error", "tectonic not found", "tectonic")]
        pdf = work / "main.pdf"
        if proc.returncode == 0 and pdf.is_file():
            return []
        log = (proc.stderr or "") + "\n" + (proc.stdout or "")
        return _parse_tectonic_log(log)


def lint_latex(
    source: str,
    *,
    run_compile: bool = True,
    tectonic_binary: Path | None = None,
) -> list[Diagnostic]:
    out = lint_static(source)
    if run_compile and tectonic_binary is not None:
        out.extend(lint_compile_tectonic(source, tectonic_binary))
    elif run_compile and tectonic_binary is None:
        out.append(
            Diagnostic(
                None,
                "warning",
                "tectonic unavailable — static checks only",
                "tectonic",
            )
        )
    return out
