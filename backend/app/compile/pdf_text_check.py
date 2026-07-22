"""Detect raw LaTeX left in a PDF after a bad compile (headers leaked into text)."""

from __future__ import annotations

import re
from typing import Iterable

# Markers that should never appear in extracted text of a successfully rendered PDF.
FORBIDDEN_LATEX_MARKERS: tuple[str, ...] = (
    r"\documentclass",
    r"\begin{document}",
    r"\end{document}",
    r"\usepackage",
)

# Allow optional whitespace after backslash noise from PDF extractors
_MARKER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(re.escape(m), re.IGNORECASE) for m in FORBIDDEN_LATEX_MARKERS
]


def find_forbidden_latex_markers(text: str) -> list[str]:
    """Return list of forbidden marker strings found in extracted PDF text."""
    if not text:
        return []
    found: list[str] = []
    for marker, pat in zip(FORBIDDEN_LATEX_MARKERS, _MARKER_PATTERNS):
        if pat.search(text):
            found.append(marker)
    return found


def assert_no_raw_latex_in_pdf_text(text: str) -> None:
    hits = find_forbidden_latex_markers(text)
    if hits:
        raise AssertionError(
            "PDF text still contains raw LaTeX markers (bad compile?): " + ", ".join(hits)
        )


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract plain text from PDF bytes via PyMuPDF (already a project dependency)."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        parts: list[str] = []
        for page in doc:
            parts.append(page.get_text("text") or "")
        return "\n".join(parts)
    finally:
        doc.close()


def check_pdf_bytes_for_raw_latex(pdf_bytes: bytes) -> list[str]:
    """Extract text from PDF bytes; return any forbidden raw-LaTeX markers found."""
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("not a PDF (missing %PDF header)")
    text = extract_pdf_text(pdf_bytes)
    return find_forbidden_latex_markers(text)
