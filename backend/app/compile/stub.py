from typing import Any

from app.compile.pdf_layout import render_resume_pdf


class StubLatexCompiler:
    """Resume PDF compiler.

    Produces valid letter-size PDFs with margins/wrapping (not full TeX).
    # ponytail: tectonic later for true LaTeX fidelity
    """

    def compile(
        self,
        *args: Any,
        title: str = "Resume",
        track: str = "latex",
        latex: str | None = None,
        structured: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        # backward-compat: old callers passed tex_bytes as first positional
        tex_bytes = kwargs.get("tex_bytes")
        if args and latex is None and tex_bytes is None:
            tex_bytes = args[0]
        if tex_bytes is not None and latex is None:
            latex = (
                tex_bytes.decode("utf-8", errors="replace")
                if isinstance(tex_bytes, (bytes, bytearray))
                else str(tex_bytes)
            )

        pdf = render_resume_pdf(title=title, track=track, latex=latex, structured=structured)
        return {
            "ok": True,
            "message": "compiled (layout engine; not full LaTeX)",
            "pdf_bytes": pdf,
            "bytes": len(pdf),
        }
