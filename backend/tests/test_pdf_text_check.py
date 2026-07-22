import pytest

from app.compile.pdf_text_check import (
    assert_no_raw_latex_in_pdf_text,
    check_pdf_bytes_for_raw_latex,
    find_forbidden_latex_markers,
)
from app.compile.pdf_layout import render_resume_pdf


def test_clean_text_passes():
    text = "Jane Doe\nSoftware Engineer\nBuilt systems with Python."
    assert find_forbidden_latex_markers(text) == []
    assert_no_raw_latex_in_pdf_text(text)  # no raise


def test_raw_documentclass_fails():
    text = r"Oops \documentclass{article} still here"
    hits = find_forbidden_latex_markers(text)
    assert r"\documentclass" in hits
    with pytest.raises(AssertionError, match="documentclass"):
        assert_no_raw_latex_in_pdf_text(text)


def test_raw_begin_end_usepackage_fail():
    text = r"\begin{document} hi \usepackage{geometry} \end{document}"
    hits = find_forbidden_latex_markers(text)
    assert r"\begin{document}" in hits
    assert r"\end{document}" in hits
    assert r"\usepackage" in hits


def test_layout_pdf_has_no_raw_latex_headers():
    """Real layout renderer produces readable text without source LaTeX commands."""
    pdf = render_resume_pdf(
        title="Sample",
        track="structured",
        structured={
            "basics": {"name": "Ada Lovelace", "email": "ada@example.com", "summary": "Mathematician."},
            "work": [],
            "education": [],
            "skills": [],
            "projects": [],
        },
    )
    hits = check_pdf_bytes_for_raw_latex(pdf)
    assert hits == [], hits
