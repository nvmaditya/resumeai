"""Latex version commits via object store (hash-skip + cap)."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.storage.protocol import ObjectStore

MAX_VERSIONS = 30


def _index_key(user_id: str, resume_id: str) -> str:
    return f"users/{user_id}/resumes/{resume_id}/versions/index.json"


def _blob_key(user_id: str, resume_id: str, vid: str) -> str:
    return f"users/{user_id}/resumes/{resume_id}/versions/{vid}.tex"


def _load_index(store: ObjectStore, user_id: str, resume_id: str) -> list[dict[str, Any]]:
    key = _index_key(user_id, resume_id)
    if not store.exists(key):
        return []
    try:
        data = json.loads(store.get(key).decode("utf-8"))
        return list(data.get("versions") or [])
    except Exception:
        return []


def _save_index(store: ObjectStore, user_id: str, resume_id: str, versions: list[dict[str, Any]]) -> None:
    store.put(
        _index_key(user_id, resume_id),
        json.dumps({"versions": versions}, ensure_ascii=False).encode("utf-8"),
    )


def list_versions(store: ObjectStore, user_id: str, resume_id: str) -> list[dict[str, Any]]:
    return _load_index(store, user_id, resume_id)


def commit_version(
    store: ObjectStore,
    user_id: str,
    resume_id: str,
    latex: str,
    message: str,
) -> dict[str, Any]:
    body = latex or ""
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
    versions = _load_index(store, user_id, resume_id)
    if versions and versions[0].get("sha256") == digest:
        return {"unchanged": True, "version": versions[0]}

    vid = str(uuid4())
    store.put(_blob_key(user_id, resume_id, vid), body.encode("utf-8"))
    entry = {
        "id": vid,
        "message": (message or "").strip()[:200] or "checkpoint",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sha256": digest,
        "size": len(body.encode("utf-8")),
    }
    versions.insert(0, entry)
    # cap: drop oldest
    while len(versions) > MAX_VERSIONS:
        old = versions.pop()
        oid = old.get("id")
        if oid:
            try:
                store.delete(_blob_key(user_id, resume_id, oid))
            except Exception:
                pass
    _save_index(store, user_id, resume_id, versions)
    return {"unchanged": False, "version": entry}


def read_version_body(store: ObjectStore, user_id: str, resume_id: str, vid: str) -> str | None:
    key = _blob_key(user_id, resume_id, vid)
    if not store.exists(key):
        return None
    return store.get(key).decode("utf-8", errors="replace")


def delete_version(
    store: ObjectStore, user_id: str, resume_id: str, vid: str
) -> bool:
    """Remove one checkpoint from index + blob. Returns False if not found."""
    versions = _load_index(store, user_id, resume_id)
    found = None
    kept: list[dict[str, Any]] = []
    for v in versions:
        if v.get("id") == vid:
            found = v
        else:
            kept.append(v)
    if not found:
        return False
    try:
        store.delete(_blob_key(user_id, resume_id, vid))
    except Exception:
        pass
    _save_index(store, user_id, resume_id, kept)
    return True
