from app.latex_lint import lint_static


def test_static_missing_end_document():
    src = r"\documentclass{article}\begin{document}Hi"
    diags = lint_static(src)
    msgs = " ".join(d.message for d in diags)
    assert "end{document}" in msgs


def test_static_unbalanced_env():
    src = r"""\documentclass{article}
\begin{document}
\begin{itemize}
\item x
\end{document}
"""
    diags = lint_static(src)
    assert any("itemize" in d.message or "unclosed" in d.message for d in diags)


def test_static_ok():
    src = r"\documentclass{article}\begin{document}Hi\end{document}"
    diags = lint_static(src)
    errors = [d for d in diags if d.severity == "error"]
    assert errors == []
