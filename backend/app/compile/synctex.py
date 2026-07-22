"""SyncTeX inverse/forward search via official `synctex` CLI (Jérôme Laurens).

Does not parse .synctex.gz by hand — shells out to the SyncTeX tool
(MiKTeX/TeX Live). Cross-platform: resolve `synctex` / `synctex.exe` on PATH.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


def resolve_synctex() -> Path | None:
    which = shutil.which("synctex") or shutil.which("synctex.exe")
    return Path(which) if which else None


def _run(args: list[str], cwd: Path) -> str:
    binary = resolve_synctex()
    if not binary:
        raise FileNotFoundError(
            "synctex CLI not found (install MiKTeX or TeX Live SyncTeX tools)"
        )
    proc = subprocess.run(
        [str(binary), *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=15,
    )
    # synctex often exits non-zero due to MiKTeX update nag; parse stdout anyway
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if "SyncTeX result begin" not in out and proc.returncode != 0:
        raise RuntimeError(out[-1500:] or f"synctex failed ({proc.returncode})")
    return out


def parse_records(text: str) -> list[dict[str, Any]]:
    """Parse official CLI record blocks."""
    if "SyncTeX result begin" not in text:
        return []
    body = text.split("SyncTeX result begin", 1)[1]
    body = body.split("SyncTeX result end", 1)[0]
    records: list[dict[str, Any]] = []
    cur: dict[str, Any] = {}
    for line in body.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        # new Output: starts a record (except first empty)
        if key == "Output" and cur and ("Line" in cur or "Page" in cur or "x" in cur):
            records.append(cur)
            cur = {}
        # types
        if key in ("Line", "Column", "Page", "Offset"):
            try:
                cur[key.lower()] = int(float(val))
            except ValueError:
                cur[key.lower()] = val
        elif key in ("x", "y", "h", "v", "W", "H"):
            try:
                cur[key if key in ("x", "y", "h", "v") else key.lower()] = float(val)
            except ValueError:
                cur[key] = val
        elif key == "Input":
            cur["input"] = val
        elif key == "Output":
            cur["output"] = val
        elif key == "Context":
            cur["context"] = val
        else:
            cur[key.lower()] = val
    if cur and ("line" in cur or "page" in cur or "x" in cur):
        records.append(cur)
    return records


def inverse_search(
    *,
    pdf_path: Path,
    page: int,
    x: float,
    y: float,
    work_dir: Path | None = None,
) -> dict[str, Any]:
    """PDF → source (synctex edit). page 1-based; x,y from top-left in bp."""
    pdf_path = pdf_path.resolve()
    cwd = work_dir or pdf_path.parent
    # -o page:x:y:file
    arg = f"{int(page)}:{x:.4f}:{y:.4f}:{pdf_path}"
    out = _run(["edit", "-o", arg, "-d", str(cwd)], cwd=cwd)
    records = parse_records(out)
    if not records:
        raise RuntimeError(f"no SyncTeX hit for page={page} x={x} y={y}\n{out[-500:]}")
    r = records[0]
    # CLI docs: line/column 0-based in -x format; stdout "Line:" is 1-based in practice for edit
    line = int(r.get("line") or 1)
    col = int(r.get("column") if r.get("column") not in (None, -1) else 0)
    if col < 0:
        col = 0
    # Prefer 1-based for editors; if line is 0, bump
    if line < 1:
        line = 1
    return {
        "input": r.get("input") or "",
        "line": line,
        "column": col,
        "records": records[:5],
    }


def forward_search(
    *,
    tex_path: Path,
    pdf_path: Path,
    line: int,
    column: int = 0,
    work_dir: Path | None = None,
) -> dict[str, Any]:
    """Source → PDF (synctex view). line 1-based."""
    tex_path = tex_path.resolve()
    pdf_path = pdf_path.resolve()
    cwd = work_dir or pdf_path.parent
    col = max(0, int(column))
    arg_i = f"{int(line)}:{col}:{tex_path}"
    out = _run(["view", "-i", arg_i, "-o", str(pdf_path)], cwd=cwd)
    records = parse_records(out)
    if not records:
        raise RuntimeError(f"no SyncTeX forward hit for line={line}\n{out[-500:]}")
    r = records[0]
    return {
        "page": int(r.get("page") or 1),
        "x": float(r.get("x") or 0),
        "y": float(r.get("y") or 0),
        "h": float(r.get("h") or 0),
        "v": float(r.get("v") or 0),
        "width": float(r.get("w") or r.get("W") or 0),
        "height": float(r.get("h") if "height" in r else r.get("H") or 0),
        "records": records[:5],
    }


def ensure_synctex_preamble(source: str) -> str:
    """Inject \\synctex=1 if missing (tectonic/pdfTeX)."""
    if re.search(r"\\synctex\s*=\s*1", source):
        return source
    # after documentclass if present
    m = re.search(r"(\\documentclass\b.*?\n)", source, re.S)
    if m:
        i = m.end()
        return source[:i] + "\\synctex=1\n" + source[i:]
    return "\\synctex=1\n" + source
