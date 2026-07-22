from app.latex_validate import is_full_latex_doc, validate_latex_apply
from app.scoring.engine import extract_github_url


def test_reject_strip_end_document():
    before = r"\documentclass{article}\begin{document}Hi\end{document}"
    bad = r"\documentclass{article}\begin{document}Hi only"
    assert validate_latex_apply(before, bad)


def test_accept_full_doc():
    before = r"\documentclass{article}\begin{document}Hi\end{document}"
    after = r"\documentclass{article}\begin{document}Hello\end{document}"
    assert validate_latex_apply(before, after) is None
    assert is_full_latex_doc(after)


def test_extract_github():
    tex = r"\href{https://github.com/octocat}{GitHub}"
    assert extract_github_url(tex, None) == "https://github.com/octocat"
