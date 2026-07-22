"""Guards against coach/apply edits that destroy LaTeX document structure."""

from __future__ import annotations


def is_full_latex_doc(text: str) -> bool:
    t = text or ""
    return (
        "\\documentclass" in t
        and "\\begin{document}" in t
        and "\\end{document}" in t
    )


def validate_latex_apply(before: str, after: str) -> str | None:
    """Return error message if apply should be rejected, else None."""
    if not after or not after.strip():
        return "empty latex body"
    if is_full_latex_doc(before):
        if "\\documentclass" not in after:
            return "edit must keep \\documentclass (full document required)"
        if "\\begin{document}" not in after:
            return "edit must keep \\begin{document}"
        if "\\end{document}" not in after:
            return "edit must keep \\end{document}"
        # crude balance: begin/end document counts
        if after.count("\\begin{document}") != after.count("\\end{document}"):
            return "unbalanced \\begin{document}/\\end{document}"
    return None
