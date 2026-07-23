---
name: resume-template
description: >
  Add or update ResumeAI LaTeX templates with form visibility meta and fill
  wiring. Use when adding templates under templates/, editing meta.json,
  templates_fill.py, or when the user asks for a new resume template/form.
---

# Resume template skill (agent checklist)

Two product paths (do not blur them):

| Path | Create | Editor | SoT |
|------|--------|--------|-----|
| Paste LaTeX | New LaTeX | CodeMirror only | `latex_body` |
| From template | From template | **Form only** | structured JSON → fill → stored `.tex` |

Users who want free LaTeX on a template: **Download .tex** → New LaTeX (no in-place dual editor).

## Files

| Path | Role |
|------|------|
| `templates/<id>.tex` | Shell with `% RESUMEAI:BODY` marker |
| `templates/<id>.meta.json` | Visible form `fields` + `sections` |
| `backend/app/templates_catalog.py` | Lists `.tex` + loads meta |
| `backend/app/templates_fill.py` | `render_body` / `render_template` per `template_id` |

## Shared form superset

**fields:** `basics.name`, `basics.email`, `basics.phone`, `basics.location`, `basics.website`, `basics.linkedin`, `basics.github`, `basics.summary`

**sections:** `education`, `work`, `projects`, `skills`, `publications`, `awards`, `certifications`

meta.json lists only what **this** shell can render. Empty form values **omit** in fill — never invent `https://linkedin.com` / fake emails.

## Add a template (do in order)

1. **Shell** — Copy a close existing `.tex`. Keep preamble/macros. Body slot:
   ```tex
   \begin{document}
   % RESUMEAI:BODY
   \end{document}
   ```
2. **meta.json** — Same stem as the `.tex`. List only supported fields/sections.
3. **Fill** — Add `_body_<name>` in `templates_fill.py` and register in `_RENDERERS`.
   - Header/contact: use real basics only; build contact lines from filled bits.
   - Sections: skip when list empty (`_has_rows`).
   - Prefer existing helpers: `_name`, `_basics`, `_contact_bits`, `_extra_list_section`.
4. **Tests** — Extend `test_templates_fill.py` / catalog tests: no placeholder URLs; real github appears when set.
5. **Gate** — `backend\.venv\Scripts\python.exe scripts\verify_before_done.py`

## meta.json example

```json
{
  "fields": [
    "basics.name",
    "basics.email",
    "basics.phone",
    "basics.location",
    "basics.linkedin",
    "basics.github",
    "basics.summary"
  ],
  "sections": ["skills", "work", "projects", "education", "certifications"]
}
```

## Do not

- Custom React form per template (shared `StructuredForm` + visibility props).
- Form tab on paste-LaTeX resumes.
- LaTeX editor tab on template resumes.
- Placeholder contact URLs or dummy emails in fill.
- Put LinkedIn/portfolio in Settings (GitHub username only for score cache).

## Smoke check

```powershell
cd backend
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -c "from app.templates_fill import render_template; t=render_template('resume-technical', {'basics':{'name':'Ada','github':'ada'}}, title='Ada'); assert 'linkedin.com' not in t or 'ada' in t; assert 'github.com/ada' in t or 'ada' in t; print('ok')"
```
