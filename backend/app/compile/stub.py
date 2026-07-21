"""Compile entry — prefer tectonic, fall back to layout engine."""

from app.compile.tectonic import LayoutCompiler, TectonicCompiler, build_compiler

# Back-compat name used by older imports/tests
StubLatexCompiler = LayoutCompiler

__all__ = ["StubLatexCompiler", "TectonicCompiler", "LayoutCompiler", "build_compiler"]
