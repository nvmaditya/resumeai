from collections.abc import Callable
from typing import Protocol, runtime_checkable

from fastapi import BackgroundTasks


@runtime_checkable
class JobRunner(Protocol):
    def enqueue(self, job_id: str, fn: Callable[[], None]) -> None: ...


class LocalJobRunner:
    """In-process runner. SaaS: swap for Redis/worker queue; job rows stay in DB."""

    def __init__(self) -> None:
        self._bg: BackgroundTasks | None = None

    def bind(self, background: BackgroundTasks) -> None:
        self._bg = background

    def enqueue(self, job_id: str, fn: Callable[[], None]) -> None:
        # ponytail: fire-and-forget thread if no request BackgroundTasks bound
        if self._bg is not None:
            self._bg.add_task(fn)
            return
        import threading

        threading.Thread(target=fn, daemon=True, name=f"job-{job_id}").start()
