from typing import Any


class StubExtractor:
    def extract(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        return {
            "basics": {"name": "", "email": "", "summary": ""},
            "work": [],
            "education": [],
            "skills": [],
            "projects": [],
        }
