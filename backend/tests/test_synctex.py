from pathlib import Path

from app.compile.synctex import ensure_synctex_preamble, parse_records, resolve_synctex
from app.compile.tectonic import build_compiler


def test_ensure_synctex_inject():
    src = r"\documentclass{article}" + "\n" + r"\begin{document}Hi\end{document}"
    out = ensure_synctex_preamble(src)
    assert r"\synctex=1" in out


def test_parse_records():
    sample = """
SyncTeX result begin
Output:main.pdf
Input:/tmp/main.tex
Line:3
Column:-1
SyncTeX result end
"""
    recs = parse_records(sample)
    assert recs and recs[0]["line"] == 3


def test_compile_emits_synctex(tmp_path: Path):
    c = build_compiler(None)
    work = tmp_path / "work"
    out = c.compile(
        title="T",
        track="latex",
        latex=r"\documentclass{article}\begin{document}Hello Sync\end{document}",
        work_dir=work,
    )
    assert out["ok"]
    if out.get("engine") == "tectonic":
        assert out.get("synctex") is True
        assert (work / "main.synctex.gz").exists() or (work / "main.synctex").exists()
        # inverse via official CLI when available
        if resolve_synctex():
            from app.compile.synctex import inverse_search

            hit = inverse_search(
                pdf_path=work / "main.pdf",
                page=1,
                x=100,
                y=100,
                work_dir=work,
            )
            assert hit["line"] >= 1
