#!/usr/bin/env python3
"""Install git pre-commit hook that runs scripts/check_compile_sample.py."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / ".git" / "hooks" / "pre-commit"

HOOK_BODY = r'''#!/bin/sh
# ResumeAI: compile sample LaTeX + ensure PDF has no raw LaTeX headers
ROOT="$(git rev-parse --show-toplevel)"
PY="$ROOT/backend/.venv/Scripts/python.exe"
if [ ! -f "$PY" ]; then
  PY="$ROOT/backend/.venv/bin/python"
fi
if [ ! -f "$PY" ]; then
  PY="python"
fi
exec "$PY" "$ROOT/scripts/check_compile_sample.py"
'''


def main() -> int:
    if not (ROOT / ".git").is_dir():
        print("FAIL: not a git repo")
        return 1
    HOOK.parent.mkdir(parents=True, exist_ok=True)
    HOOK.write_text(HOOK_BODY.replace("\r\n", "\n"), encoding="utf-8", newline="\n")
    try:
        HOOK.chmod(HOOK.stat().st_mode | 0o111)
    except OSError:
        pass
    print(f"installed: {HOOK}")
    print("manual: backend\\.venv\\Scripts\\python.exe scripts\\check_compile_sample.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
