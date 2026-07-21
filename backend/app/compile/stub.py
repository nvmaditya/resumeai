from typing import Any


class StubLatexCompiler:
    def compile(self, tex_bytes: bytes) -> dict[str, Any]:
        # Minimal PDF header so clients can download a placeholder file
        placeholder = b"%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
        return {
            "ok": True,
            "message": "stub compile (tectonic not wired)",
            "pdf_bytes": placeholder,
        }
