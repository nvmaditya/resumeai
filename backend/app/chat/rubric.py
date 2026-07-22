"""Hiring-agent score rubric distilled for coach prompts (no invent)."""

# Distilled from backend/vendor/hiring-agent/prompts/templates/resume_evaluation_*.jinja
HIRING_AGENT_RUBRIC = """
SCORER (HackerRank hiring-agent style) — categories and what moves scores:

open_source (0-35): contributions to OTHER people's projects, GSoC, multi-contributor repos.
  Personal-only GitHub / tutorial repos score low (≤10). Hacktoberfest-only is weak.

self_projects (0-30): complex real-world systems, architecture, adoption.
  Todo/CRUD/weather/tutorial apps score low. Missing GitHub/demo links penalize heavily.
  Live demo links help. Prefer complexity over quantity.

production (0-25): internships, real work, founder/early engineer. Empty work → low.

technical_skills (0-10): skills evidenced in projects/work, not bare keyword lists.

bonus (≤20): portfolio URL, LinkedIn, technical blogs, GSoC, founder/early-stage roles.
deductions: simple projects, missing/broken project links.

FAIRNESS: scorer ignores name, school, GPA, city — only skills/impact evidence.

COACH RULES:
- Never invent employers, titles, dates, metrics, techs, URLs, stars, or OSS claims.
- Hunks may only rephrase/restructure facts and links ALREADY in the resume text.
- If a gap needs real-world evidence (true OSS, new demo, new job), put that ONLY in reply.
""".strip()
