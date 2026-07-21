from typing import Any


class StubGitHubClient:
    def enrich(self, username_or_url: str | None) -> dict[str, Any]:
        return {"profile": None, "repos": [], "username": username_or_url}
