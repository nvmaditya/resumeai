from app.templates_fill import escape_tex, render_template


def test_escape_tex_ampersand():
    assert r"\&" in escape_tex("A & B")


def test_empty_form_no_sample_placeholders():
    tex = render_template("resume-classic-ats", {}, title="Ada")
    assert "FULL NAME" not in tex
    assert "Company Name" not in tex
    assert "RESUMEAI:BODY" not in tex
    assert "Ada" in tex or "Name" in tex


def test_education_only_omits_experience():
    data = {
        "basics": {"name": "Ada", "email": "a@b.c", "summary": ""},
        "work": [],
        "education": [
            {
                "institution": "MIT",
                "area": "CS",
                "studyType": "BS",
                "startDate": "2012",
                "endDate": "2016",
            }
        ],
        "skills": [],
        "projects": [],
    }
    tex = render_template("resume-classic-ats", data, title="Ada")
    assert "Education" in tex
    assert "MIT" in tex
    assert "Experience" not in tex
    assert "Company Name" not in tex


def test_all_templates_render():
    data = {
        "basics": {"name": "Ada", "email": "a@b.c", "summary": "Builder"},
        "work": [
            {
                "name": "Acme",
                "position": "Eng",
                "startDate": "2020",
                "endDate": "Now",
                "summary": "Shipped X\nShipped Y",
            }
        ],
        "education": [],
        "skills": [{"name": "Lang", "keywords": ["Python", "Go"]}],
        "projects": [],
    }
    for tid in (
        "resume-classic-ats",
        "resume-entry-level",
        "resume-executive",
        "resume-modern-professional",
        "resume-technical",
    ):
        tex = render_template(tid, data, title="Ada")
        assert "\\begin{document}" in tex
        assert "Ada" in tex
        assert "Acme" in tex
