from pathlib import Path


class LocalObjectStore:
    """Local filesystem ObjectStore. SaaS: swap for S3-compatible impl."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # prevent path traversal
        safe = Path(key.replace("\\", "/").lstrip("/"))
        full = (self.root / safe).resolve()
        if not str(full).startswith(str(self.root.resolve())):
            raise ValueError("invalid object key")
        return full

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()
