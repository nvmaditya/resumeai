#!/usr/bin/env python3
"""Compile sample LaTeX resume and fail if PDF text still contains raw LaTeX headers.

Uses the real backend compile path (build_compiler / tectonic when available).

Run from repo root:
  backend\\.venv\\Scripts\\python.exe scripts\\check_compile_sample.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

SAMPLE = BACKEND / "tests" / "fixtures" / "ai_eng_resume.tex"
if not SAMPLE.is_file():
    SAMPLE = ROOT / "resume" / "latex" / "ai_eng_resume.tex"


def main() -> int:
    from app.compile.pdf_text_check import check_pdf_bytes_for_raw_latex, extract_pdf_text
    from app.compile.tectonic import build_compiler, resolve_tectonic

    print(f"sample: {SAMPLE}")
    if not SAMPLE.is_file():
        print("FAIL: sample latex resume not found")
        return 1

    latex = SAMPLE.read_text(encoding="utf-8")
    work = BACKEND / "data" / "_hook_compile_sample" / "work"
    work.mkdir(parents=True, exist_ok=True)

    binary = resolve_tectonic(None)
    print(f"tectonic: {binary or 'MISSING — may fall back to layout'}")

    compiler = build_compiler(None)
    result = compiler.compile(
        title="Sample Resume",
        track="latex",
        latex=latex,
        work_dir=work,
    )
    engine = result.get("engine")
    pdf_bytes = result.get("pdf_bytes") or b""
    msg = result.get("message") or ""
    print(f"compile: engine={engine} bytes={result.get('bytes')}")
    print(f"message: {msg[:200]}")

    if not pdf_bytes.startswith(b"%PDF"):
        print("FAIL: compile did not produce a PDF")
        return 1

    # Layout fallback after tectonic failure can still "succeed" with a PDF;
    # still run marker check. If engine is layout after tectonic was intended, warn.
    if engine == "layout" and binary is not None:
        print(
            "WARN: tectonic binary present but compile used layout fallback — "
            f"{msg[:180]}"
        )
        # Honest fail: we expected real TeX when binary exists
        print("FAIL: expected tectonic compile when binary is installed")
        return 1

    try:
        hits = check_pdf_bytes_for_raw_latex(pdf_bytes)
    except Exception as exc:
        print(f"FAIL: PDF text extraction error: {exc}")
        return 1

    text_preview = extract_pdf_text(pdf_bytes)[:300].replace("\n", " ")
    print(f"extracted_preview: {text_preview!r}")

    if hits:
        print("FAIL: raw LaTeX markers in PDF text:", ", ".join(hits))
        return 1

    print(
        f"PASS: compile+extract OK (engine={engine}, bytes={len(pdf_bytes)}, "
        "no forbidden LaTeX headers)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
