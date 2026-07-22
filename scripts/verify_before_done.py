#!/usr/bin/env python3
"""Mandatory gate before an agent claims work is done.

Runs:
  1. backend pytest (all tests/)
  2. compile sample LaTeX quality check
  3. frontend production build (tsc + vite)

Exit non-zero on any failure. From repo root:

  backend\\.venv\\Scripts\\python.exe scripts\\verify_before_done.py
  backend\\.venv\\Scripts\\python.exe scripts\\verify_before_done.py --fast   # skip frontend build
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def _venv_python() -> Path:
    win = BACKEND / ".venv" / "Scripts" / "python.exe"
    nix = BACKEND / ".venv" / "bin" / "python"
    if win.is_file():
        return win
    if nix.is_file():
        return nix
    return Path(sys.executable)


def _run(label: str, cmd: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> int:
    print(f"\n=== {label} ===")
    print(" ".join(cmd))
    merged = os.environ.copy()
    if env:
        merged.update(env)
    proc = subprocess.run(cmd, cwd=str(cwd), env=merged)
    if proc.returncode != 0:
        print(f"FAIL: {label} (exit {proc.returncode})")
    else:
        print(f"PASS: {label}")
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify before claiming done")
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Skip frontend build (pre-commit); still runs pytest + compile check",
    )
    args = parser.parse_args()

    py = str(_venv_python())
    failed: list[str] = []

    code = _run(
        "backend pytest",
        [py, "-m", "pytest", "tests/", "-q", "--tb=line"],
        cwd=BACKEND,
        env={"PYTHONPATH": str(BACKEND)},
    )
    if code != 0:
        failed.append("pytest")

    code = _run(
        "compile sample check",
        [py, str(ROOT / "scripts" / "check_compile_sample.py")],
        cwd=ROOT,
        env={"PYTHONPATH": str(BACKEND)},
    )
    if code != 0:
        failed.append("compile_sample")

    if not args.fast:
        npm = "npm.cmd" if os.name == "nt" else "npm"
        code = _run(
            "frontend build",
            [npm, "run", "build"],
            cwd=FRONTEND,
        )
        if code != 0:
            failed.append("frontend_build")
    else:
        print("\n=== frontend build ===\nSKIP (--fast)")

    print("\n" + "=" * 40)
    if failed:
        print("DONE GATE FAILED:", ", ".join(failed))
        print("Do not claim complete until this script exits 0.")
        return 1
    print("DONE GATE PASSED: all checks green")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
