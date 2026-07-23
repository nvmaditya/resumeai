import pytest

from app.templates_catalog import DEFAULT_FIELDS, list_templates, load_template_body


def test_list_templates_nonempty():
    items = list_templates()
    assert len(items) >= 1
    assert all(t.id and t.filename.endswith(".tex") for t in items)


def test_templates_have_meta_fields_sections():
    items = list_templates()
    assert len(items) >= 5
    for t in items:
        assert t.fields, t.id
        assert t.sections, t.id
        assert "basics.name" in t.fields
        # technical omits website in meta; classic has full set
        assert all(isinstance(x, str) for x in t.fields)
        assert all(isinstance(x, str) for x in t.sections)


def test_technical_meta_has_github_not_required_website():
    tech = next(t for t in list_templates() if t.id == "resume-technical")
    assert "basics.github" in tech.fields
    assert "basics.linkedin" in tech.fields


def test_load_known_template():
    items = list_templates()
    body = load_template_body(items[0].id)
    assert "\\documentclass" in body or "documentclass" in body


def test_reject_traversal():
    with pytest.raises(ValueError):
        load_template_body("../etc/passwd")
    with pytest.raises(ValueError):
        load_template_body("not-a-real-template")


def test_default_fields_superset():
    assert "basics.linkedin" in DEFAULT_FIELDS
    assert "publications" in __import__(
        "app.templates_catalog", fromlist=["DEFAULT_SECTIONS"]
    ).DEFAULT_SECTIONS
