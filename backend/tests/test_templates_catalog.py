import pytest

from app.templates_catalog import list_templates, load_template_body


def test_list_templates_nonempty():
    items = list_templates()
    assert len(items) >= 1
    assert all(t.id and t.filename.endswith(".tex") for t in items)


def test_load_known_template():
    items = list_templates()
    body = load_template_body(items[0].id)
    assert "\\documentclass" in body or "documentclass" in body


def test_reject_traversal():
    with pytest.raises(ValueError):
        load_template_body("../etc/passwd")
    with pytest.raises(ValueError):
        load_template_body("not-a-real-template")
