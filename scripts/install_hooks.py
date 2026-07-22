#!/usr/bin/env python3
"""Install git pre-commit hook: pytest + compile sample check (fast gate).

Full done-gate (includes frontend build):
  backend\\.venv\\Scripts\\python.exe scripts\\verify_before_done.py
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / ".git" / "hooks" / "pre-commit"

HOOK_BODY = r'''#!/bin/sh
# ResumeAI: pre-commit = pytest + sample LaTeX compile quality (--fast skips frontend)
ROOT="$(git rev-parse --show-toplevel)"
PY="$ROOT/backend/.venv/Scripts/python.exe"
if [ ! -f "$PY" ]; then
  PY="$ROOT/backend/.venv/bin/python"
fi
if [ ! -f "$PY" ]; then
  PY="python"
fi
exec "$PY" "$ROOT/scripts/verify_before_done.py" --fast
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
    print("pre-commit: verify_before_done.py --fast  (pytest + compile sample)")
    print("before done: backend\\.venv\\Scripts\\python.exe scripts\\verify_before_done.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
