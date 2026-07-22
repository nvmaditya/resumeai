from app.resumes.tags import normalize_tags


def test_normalize_tags_caps_and_dedupes():
    assert normalize_tags(["  a ", "a", "b", ""]) == ["a", "b"]
    assert len(normalize_tags([f"t{i}" for i in range(20)])) == 8


def test_normalize_tags_truncates_length():
    long = "x" * 50
    out = normalize_tags([long])
    assert out == ["x" * 32]


def test_normalize_tags_none():
    assert normalize_tags(None) == []
