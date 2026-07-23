"""Structural checks on shipped frontend UX (no browser)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FE = ROOT / "frontend" / "src"


def _read(*parts: str) -> str:
    return (FE.joinpath(*parts)).read_text(encoding="utf-8")


def test_no_from_template_create_flow():
    listing = _read("pages", "ResumeList.tsx")
    assert "From template" not in listing
    assert "createFromTemplate" not in listing
    assert "pickerOpen" not in listing
    assert "New AI resume" in listing
    assert "data-create-ai" in listing
    assert 'track: \'structured\'' in listing or 'track: "structured"' in listing
    assert "data-create-flow" in listing


def test_editor_workspace_chrome_and_versions():
    editor = _read("pages", "ResumeEditor.tsx")
    assert 'data-workspace="latex-editor"' in editor or "data-workspace=" in editor
    assert "ws-toolbar" in editor or "Workspace actions" in editor
    assert "version-row" in editor
    assert "data-version-row" in editor
    assert "data-editor-diff-strip" in editor
    assert "data-apply-selected" in editor
    assert "filterSelectedHunks" in editor
    assert "findHunkRanges" in editor
    assert "hunkMarks" in editor
    # Form | Source tabs for AI path
    assert "editorTab" in editor
    assert "AI Generate" in editor


def test_coach_and_editor_hunk_select_wiring():
    coach = _read("components", "CoachChat.tsx")
    latex = _read("components", "LatexEditor.tsx")
    hunks = _read("lib", "hunks.ts")
    assert "data-hunk-checkbox" in coach
    assert "onApplySelected" in coach
    assert "selectedHunks" in coach
    assert "cm-hunk-selected" in latex
    assert "hunkMarks" in latex
    assert "setHunkMarks" in latex or "hunkMarkField" in latex
    assert "filterSelectedHunks" in hunks
    assert "findHunkRanges" in hunks


def test_css_version_and_diff_classes():
    css = _read("index.css")
    assert ".version-row" in css
    assert ".editor-diff-strip" in css
    assert ".ws-toolbar" in css


def test_generate_skill_encodes_template_structure():
    skill = ROOT / ".grok" / "skills" / "resume-latex-generate" / "SKILL.md"
    text = skill.read_text(encoding="utf-8")
    assert "classic-ats" in text or "classic" in text.lower()
    assert "Section order" in text or "section order" in text.lower()
    assert "hfill" in text or "Experience" in text


def test_agents_readme_before_commit_and_lessons():
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    lessons = (ROOT / "LESSONS.md").read_text(encoding="utf-8")
    assert "README" in agents and "before every commit" in agents.lower()
    assert "New AI resume" in readme or "AI Generate" in readme
    assert "From template" not in readme or "no user-facing template" in readme.lower()
    assert "per-hunk" in readme.lower() or "Apply selected" in readme
    # ≥3 concrete lessons
    bullets = [ln for ln in lessons.splitlines() if ln.strip().startswith(("1.", "2.", "3.", "- "))]
    assert len(bullets) >= 3
