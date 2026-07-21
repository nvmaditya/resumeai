# ResumeAI Design System

## Product
ResumeAI is an AI resume optimization tool for software engineers: multi-resume workspace, LaTeX/structured editors, ATS-style scoring with progress, and a JD-aware coach that proposes approve-to-apply edits.

## Brand personality
- Technical, calm, premium — not playful SaaS candy
- Feels like a modern IDE + career cockpit for engineers
- Trustworthy scoring (evidence-first), not gamified fluff

## Visual direction
- **Mode:** Dark (primary). Optional light later.
- **Background:** Deep slate/ink `#0B0F14` → elevated panels `#12181F`
- **Primary accent:** Emerald `#10B981` (score, CTAs, success)
- **Secondary accent:** Amber `#F59E0B` (proposed edits, warnings)
- **Danger:** Rose `#F43F5E` (failed jobs, errors)
- **Text:** Primary `#F1F5F9`, secondary `#94A3B8`, muted `#64748B`
- **Borders:** `#1E293B` hairlines; focus ring emerald soft glow
- **Radius:** 12px cards, 8px controls, full pills for status chips
- **Typography:** Headlines **Space Grotesk** or **Sora**; body **Inter** or **DM Sans**; code/editor **JetBrains Mono**
- **Density:** Comfortable desktop (target 1280–1440px); side panels, not mobile-first

## Layout patterns
1. **Auth shell:** Centered card on subtle radial gradient, product mark top-left
2. **App shell:** Slim top bar (logo, nav, user) + max-width content
3. **Workspace (editor):** 12-col grid — editor 7 cols | score+coach 5 cols; sticky action bar under title
4. **Cards:** Elevated surface, 1px border, no heavy shadows (use depth via border + slight lift)

## Components
- Primary button: solid emerald, white text
- Secondary: ghost border slate
- Inputs: dark fill, slate border, monospaced where code
- Score ring / large overall number
- Progress stepper: queued → processing → complete (failed = rose)
- Category score rows with evidence microcopy
- Diff proposal card: amber border, before/after, Approve CTA
- Empty states: short, action-led

## Accessibility
- Contrast WCAG AA on dark
- Visible focus states
- Status not color-only (labels + icons)

## Do not
- Purple gradient startup cliché
- Glassmorphism overload
- Crowded mobile hamburger as primary desktop pattern
- Fake stock photos of “happy candidates”
