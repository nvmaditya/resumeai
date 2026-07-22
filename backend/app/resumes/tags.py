"""Normalize freeform resume tags (trust boundary)."""

from __future__ import annotations

MAX_TAGS = 8
MAX_TAG_LEN = 32


def normalize_tags(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        t = (item or "").strip()
        if not t:
            continue
        if len(t) > MAX_TAG_LEN:
            t = t[:MAX_TAG_LEN]
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= MAX_TAGS:
            break
    return out
