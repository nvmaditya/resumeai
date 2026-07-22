"""Apply exact find/replace coach hunks. Each find must appear once."""

from __future__ import annotations

from typing import Sequence


def apply_hunks(text: str, hunks: Sequence[dict[str, str] | object]) -> str:
    """Apply ordered hunks. Raises ValueError on missing/ambiguous find."""
    out = text or ""
    if not hunks:
        raise ValueError("no hunks to apply")
    for i, h in enumerate(hunks):
        if isinstance(h, dict):
            find = h.get("find") or ""
            replace = h.get("replace") if h.get("replace") is not None else ""
        else:
            find = getattr(h, "find", "") or ""
            replace = getattr(h, "replace", "")
            if replace is None:
                replace = ""
        if not find:
            raise ValueError(f"hunk {i}: empty find")
        n = out.count(find)
        if n == 0:
            raise ValueError(f"hunk {i}: find string not found in document")
        if n > 1:
            raise ValueError(f"hunk {i}: find string is not unique ({n} matches)")
        out = out.replace(find, replace, 1)
    return out
