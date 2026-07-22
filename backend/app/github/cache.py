"""User-level GitHub snapshot. Network only on explicit refresh."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.storage.protocol import ObjectStore

MAX_TOP = 5
_STOP = frozenset(
    "a an the and or for to of in on with by from is are be as at this that we you our your".split()
)


def snapshot_key(user_id: str) -> str:
    return f"users/{user_id}/github/snapshot.json"


def load_snapshot(store: ObjectStore, user_id: str) -> dict[str, Any] | None:
    key = snapshot_key(user_id)
    if not store.exists(key):
        return None
    try:
        return json.loads(store.get(key).decode("utf-8"))
    except Exception:
        return None


def save_snapshot(store: ObjectStore, user_id: str, data: dict[str, Any]) -> None:
    store.put(snapshot_key(user_id), json.dumps(data, ensure_ascii=False).encode("utf-8"))


def refresh_github(
    username: str,
    *,
    vendor_path: str,
    store: ObjectStore,
    user_id: str,
) -> dict[str, Any]:
    """Hit GitHub APIs once via vendor helpers; store full repo list (no score-time network)."""
    username = (username or "").strip().lstrip("@")
    if not username:
        raise ValueError("github_username required")

    vendor = Path(vendor_path).resolve()
    if str(vendor) not in sys.path:
        sys.path.insert(0, str(vendor))

    from github import (  # type: ignore
        extract_github_username,
        fetch_all_github_repos,
        fetch_github_profile,
        generate_profile_json,
    )

    url = f"https://github.com/{username}"
    if extract_github_username(url) != username:
        # normalize weird input
        u = extract_github_username(username) or username
        url = f"https://github.com/{u}"
        username = u

    profile = fetch_github_profile(url)
    if not profile:
        raise ValueError(f"GitHub profile not found: {username}")

    repos_raw = fetch_all_github_repos(url) or []
    # Store lean repo list (all); no LLM selection here
    repos: list[dict[str, Any]] = []
    for p in repos_raw:
        if not isinstance(p, dict):
            continue
        repos.append(
            {
                "name": p.get("name"),
                "description": p.get("description"),
                "github_url": p.get("github_url") or p.get("html_url"),
                "live_url": p.get("live_url") or p.get("homepage"),
                "technologies": p.get("technologies") or p.get("language") or [],
                "project_type": p.get("project_type") or "self_project",
                "contributor_count": p.get("contributor_count") or 1,
                "author_commit_count": p.get("author_commit_count") or 0,
                "stars": (p.get("github_details") or {}).get("stars")
                or p.get("stargazers_count")
                or 0,
                "language": p.get("language")
                or (
                    (p.get("technologies") or [None])[0]
                    if isinstance(p.get("technologies"), list)
                    else p.get("technologies")
                ),
            }
        )

    snap = {
        "username": username,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "profile": generate_profile_json(profile),
        "repos": repos,
        "total_repos": len(repos),
    }
    save_snapshot(store, user_id, snap)
    return {
        "ok": True,
        "username": username,
        "fetched_at": snap["fetched_at"],
        "repo_count": len(repos),
    }


def select_top_repos(
    repos: list[dict[str, Any]],
    job_description: str | None,
    *,
    k: int = MAX_TOP,
) -> list[dict[str, Any]]:
    if not repos:
        return []
    if not job_description or not job_description.strip():
        # stars / commits first
        ranked = sorted(
            repos,
            key=lambda r: (
                int(r.get("stars") or 0),
                int(r.get("author_commit_count") or 0),
            ),
            reverse=True,
        )
        return ranked[:k]

    tokens = _tokens(job_description)
    scored: list[tuple[float, dict[str, Any]]] = []
    for r in repos:
        blob = " ".join(
            str(x)
            for x in (
                r.get("name"),
                r.get("description"),
                r.get("language"),
                r.get("technologies"),
                r.get("project_type"),
            )
            if x
        ).lower()
        hit = sum(1 for t in tokens if t in blob)
        score = hit * 10 + int(r.get("stars") or 0) * 0.1 + int(r.get("author_commit_count") or 0) * 0.01
        scored.append((score, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:k]]


def github_blob_to_text(profile: dict[str, Any] | None, projects: list[dict[str, Any]]) -> str:
    lines = ["=== GITHUB DATA ==="]
    if profile:
        lines.append(f"username: {profile.get('username')}")
        if profile.get("bio"):
            lines.append(f"bio: {profile.get('bio')}")
        if profile.get("public_repos") is not None:
            lines.append(f"public_repos: {profile.get('public_repos')}")
        if profile.get("followers") is not None:
            lines.append(f"followers: {profile.get('followers')}")
    lines.append("projects:")
    for p in projects:
        lines.append(
            f"- {p.get('name')}: {p.get('description') or ''} "
            f"type={p.get('project_type')} stars={p.get('stars')} "
            f"url={p.get('github_url') or ''}"
        )
    return "\n".join(lines)


def jd_keyword_match(job_description: str | None, corpus: str) -> dict[str, Any]:
    if not job_description or not job_description.strip():
        return {
            "provided": False,
            "matched_keywords": [],
            "missing_keywords": [],
            "relevance_score": 0,
        }
    tokens = list(_tokens(job_description))[:40]
    corp = (corpus or "").lower()
    matched = [t for t in tokens if t in corp]
    missing = [t for t in tokens if t not in corp]
    rel = int(round(100 * len(matched) / max(1, len(tokens))))
    return {
        "provided": True,
        "matched_keywords": matched[:20],
        "missing_keywords": missing[:20],
        "relevance_score": rel,
    }


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9+.#-]{1,}", text.lower())
    out: list[str] = []
    seen: set[str] = set()
    for w in words:
        if w in _STOP or len(w) < 2:
            continue
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out
