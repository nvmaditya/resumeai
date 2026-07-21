# Stitch prompts — ResumeAI UI revamp

Use with **Desktop** device type. Apply design system after first screen if tokens exist.

Project name: **ResumeAI**

**Implemented in app (2026-07-22):** light default + dark toggle, structured form editor, fixed coach actions (no free chat), injection hardening.

---

## Prompt 0 — Design system (via create_design_system)

### 0a Light (default product)

Display name: `ResumeAI Light`

- colorMode: LIGHT
- customColor / primary: `#059669`
- headlineFont: SPACE_GROTESK
- bodyFont: INTER
- roundness: ROUND_TWELVE
- colorVariant: TONAL_SPOT
- surfaces: page `#F4F6F8`, card `#FFFFFF`, border `#E2E8F0`, text `#0F172A`

### 0b Dark

Display name: `ResumeAI Dark`

- colorMode: DARK
- customColor / primary: `#10B981`
- headlineFont: SPACE_GROTESK
- bodyFont: INTER
- roundness: ROUND_TWELVE

designMd: contents of `docs/stitch/DESIGN.md`

---

## Prompt 1 — Login (DESKTOP)

```
Design a polished desktop login page for ResumeAI, an AI resume optimization product for software engineers.

Layout:
- Full-viewport dark background (#0B0F14) with subtle radial emerald glow top-right
- Top-left: wordmark "ResumeAI" in emerald, Space Grotesk, no tagline clutter
- Center: single elevated auth card (~420px wide) with border #1E293B, radius 12px, surface #12181F
- Card title: "Welcome back"
- Subtitle: "Score, coach, and ship a stronger engineering resume."
- Fields: Email, Password (dark inputs, slate borders, clear labels above fields)
- Primary CTA full-width: "Continue" emerald #10B981
- Footer text: "No account? Create one" with "Create one" as text link
- Tiny status line for error in rose (show example error "Invalid credentials" as optional muted demo state OFF by default)
- No social login buttons
- No illustration stock photos; optional abstract geometric grid or code-bracket motif very subtle behind card

Style: premium technical SaaS, calm, high contrast, Inter body, Space Grotesk headings. Desktop 1440×900 frame.
```

---

## Prompt 2 — Register (DESKTOP)

```
Design the registration page for ResumeAI matching the Login screen visual system exactly (dark slate, emerald accent, same card chrome).

Differences from login:
- Title: "Create your account"
- Subtitle: "Local-first resume workspace with ATS scoring and AI coach."
- Fields: Email, Password (helper under password: "At least 8 characters")
- Primary CTA: "Create account"
- Footer: "Already have an account? Log in"

Keep same wordmark, spacing, and input styles as Login. Desktop 1440×900.
```

---

## Prompt 3 — Resume library / list (DESKTOP)

```
Design the authenticated Resume Library home for ResumeAI.

App chrome:
- Slim top bar: left "ResumeAI" emerald wordmark; right text links "Resumes" (active) and "Log out"
- Content max-width ~1100px centered, generous padding

Header row:
- H1 "Your resumes"
- Right: two buttons — primary "New LaTeX", secondary outline "New structured"

Content:
- Vertical list of resume cards (3 example items):
  1) "Staff SWE — LaTeX track" badge "latex", secondary meta "Updated 2h ago · Score 72"
  2) "Backend — Structured" badge "structured", meta "No score yet"
  3) "Internship 2026" badge "latex", meta "Score 58 · 3 suggestions"
- Each card: left title+badges, right chevron; hover border turns emerald-soft
- Empty-state variant note: if zero resumes, show centered empty with CTA "Create your first resume" (show one filled list, not empty)

Style: dark surfaces #12181F cards on #0B0F14, hairline borders, no heavy shadows. Desktop 1440×900.
```

---

## Prompt 4 — Resume workspace (editor + score + coach) — HERO SCREEN (DESKTOP)

```
Design the main Resume Workspace for ResumeAI — the hero product screen. Desktop 1440×900, dark technical SaaS.

TOP:
- Breadcrumb link "← Resumes"
- Title row: "Staff SWE Resume" + small track chip "latex" + muted UUID truncated
- Action cluster right: secondary "Save", secondary "Compile", primary emerald "Re-check score"

LEFT COLUMN (~58% width) — Editor panel:
- Card titled "LaTeX editor"
- Large monospaced textarea (JetBrains Mono look) filled with sample LaTeX snippet (documentclass article, sections Experience / Projects)
- Subtle line numbers optional
- Footer micro: "Unsaved changes" amber text optional OFF

RIGHT COLUMN (~42%):
1) SCORE CARD
   - Title "ATS score"
   - Horizontal progress stepper pills: queued → processing → complete (complete active emerald)
   - Large overall score "72" with "/100" muted
   - List of category rows:
     • technical_skills 80 — evidence one line
     • open_source 60
     • self_projects 70
     • production 75
     • jd_relevance 0
   - Each row: name, score bar thin emerald, expandable evidence (show one expanded)

2) COACH CARD below score
   - Title "JD-aware coach"
   - Textarea "Paste job description" with 3 lines of sample JD
   - Input "How can I improve my score?"
   - Button "Ask" emerald
   - Coach reply paragraph (score-grounded sample text)
   - Proposed edit panel with amber border:
     header "Proposed edit · latex"
     monospaced after-text preview
     CTA "Approve & apply" amber button
     secondary "Dismiss" ghost

Global: no purple gradients, no stock photos, calm dense professional layout. Match design system tokens.
```

---

## Prompt 5 — Scoring in progress state (variant of workspace)

```
Edit the Resume Workspace so the Score card is mid-job:
- Stepper shows "processing" active (middle pill emerald pulse-like emphasis)
- Overall score area shows skeleton or "Scoring…" instead of number
- Category list muted/placeholder
- Re-check score button disabled/loading
- Keep editor and coach structure; coach may show helper "Results appear when scoring completes"
Desktop, same design system.
```

---

## Prompt 6 — Proposed edit focus (variant)

```
Edit the Resume Workspace to emphasize the approve-edit flow:
- Coach proposed-edit card elevated, amber focus ring
- Show simple before/after split (before muted strikethrough-ish, after highlighted)
- Sticky bottom bar on the proposal: "Approve & apply" primary amber, "Reject" ghost
- Editor shows a soft highlight on changed region if possible
Same dark design system, desktop.
```

---

## Generation order
1. Create project + design system  
2. Generate Prompt 1 Login  
3. Generate Prompt 2 Register (same DS)  
4. Generate Prompt 3 Library  
5. Generate Prompt 4 Workspace (hero)  
6. Optional edit_screens for 5–6 variants  
7. download_assets → implement in React  
