from pathlib import Path

from app.compile.tectonic import build_compiler, resolve_tectonic, structured_to_tex


def test_resolve_local_bin():
    # After install: backend/bin/tectonic.exe should resolve
    p = resolve_tectonic(None)
    # May be None in CI without binary; if present must be file
    if p is not None:
        assert p.is_file()


def test_structured_to_tex_has_document():
    tex = structured_to_tex("T", {"basics": {"name": "Ada", "email": "a@b.c", "summary": "Hi"}})
    assert r"\begin{document}" in tex
    assert "Ada" in tex


def test_compile_produces_pdf():
    c = build_compiler(None)
    out = c.compile(
        title="Test",
        track="latex",
        latex=r"\documentclass{article}\begin{document}Hello Overleaf\end{document}",
    )
    assert out["ok"]
    assert out["pdf_bytes"].startswith(b"%PDF")
    assert out["bytes"] > 200
    # Prefer tectonic when binary present
    bin_path = Path(__file__).resolve().parents[1] / "bin" / "tectonic.exe"
    if bin_path.is_file():
        assert out.get("engine") == "tectonic"
