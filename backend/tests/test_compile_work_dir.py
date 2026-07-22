"""Failing-path regression: tectonic must open main.tex under absolute work_dir."""

from pathlib import Path

from app.compile.tectonic import build_compiler


def test_tectonic_with_nested_absolute_work(tmp_path: Path):
    work = (tmp_path / "users" / "u1" / "resumes" / "r1" / "work").resolve()
    c = build_compiler(None)
    out = c.compile(
        title="T",
        track="latex",
        latex=r"\documentclass{article}\begin{document}Hi\end{document}",
        work_dir=work,
    )
    assert out["ok"] is True
    assert out.get("engine") == "tectonic", out.get("message")
    assert (work / "main.tex").is_file()
    assert (work / "main.pdf").is_file()
