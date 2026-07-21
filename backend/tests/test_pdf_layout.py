from app.compile.pdf_layout import build_pdf, render_resume_pdf, structured_to_blocks


def test_valid_pdf_header_and_size():
    data = {
        "basics": {"name": "Ada Lovelace", "email": "ada@example.com", "summary": "Mathematician and first programmer."},
        "work": [{"name": "Analytical Engines", "position": "Engineer", "startDate": "1840", "endDate": "1852", "summary": "Notes on the engine."}],
        "skills": [{"name": "Core", "keywords": ["math", "logic"]}],
        "projects": [{"name": "Bernoulli", "description": "Algorithm notes", "highlights": ["First program"]}],
        "education": [{"institution": "Home", "area": "Math", "studyType": "Independent"}],
    }
    pdf = render_resume_pdf(title="Ada", track="structured", structured=data)
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF") or b"%%EOF" in pdf[-32:]
    assert len(pdf) > 500
    assert b"/Type /Page" in pdf or b"/Type/Page" in pdf.replace(b" ", b"")
    assert b"Ada Lovelace" in pdf or b"Ada" in pdf


def test_wrap_many_lines_multipage():
    blocks = [("title", "Long")] + [("body", "word " * 40) for _ in range(80)]
    pdf = build_pdf(blocks)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1000
