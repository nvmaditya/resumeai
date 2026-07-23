# Lessons learned (ResumeAI)

Agents: **append** a bullet when you ship a mistake that needed a second ask, or when you wrong-footed the product intent on the first try. Keep each item concrete (what went wrong → rule).

## Product & architecture

1. **LLM generate must wire `coach.complete` on the HTTP path, not only unit-inject callables.** Shipping LangGraph + skill with stub-only seed looked “done” until skeptic asked whether production ever called the model. Rule: when `COACH_BACKEND ≠ stub`, router must pass `make_llm_seed`/`make_llm_revise`; add a TestClient test with a fake coach on `app.state`.

2. **“AI generate resumes” means drop user-facing template pickers — not only add a Generate button.** Leaving “From template” as a primary create path kept static shells as product surface and conflicted with the goal. Rule: create flow is **New AI resume** (structured form → AI Generate) + **New LaTeX** (paste); `templates/*.tex` are internal skill reference only.

3. **Coach hunks need per-hunk select and in-editor highlights.** Truncated −/+ lists only inside a floating chat are not enough; users could not pick individual diffs. Rule: checkboxes for each hunk, Apply selected vs Apply all, decorations on find ranges in CodeMirror; apply API already accepts a subset list.

4. **Workspace chrome: group actions; don’t orphan controls.** Packing Save/Compile/Score/Delete next to tags in one wrapping row felt misplaced; version Restore/Delete stacked in cramped cells was unusable. Rule: two-tier header (identity + File|Build|Score|Danger toolbar); version rows with message, time, side-by-side actions.

5. **Form path must expose Source after generate.** Storing `latex_body` while UI stayed form-only made AI output invisible. Rule: Form | Source tabs on structured resumes; switch to Source after AI Generate / coach diffs.

6. **`used_llm` honesty.** Silent `form_to_latex` fallback looked like a successful live model. Rule: surface `used_llm` in API + toast (“AI” vs “template fallback”).

## Process

7. **Update README before every commit** (see `AGENTS.md` checklist). Stale README described 1/5 actions column long after layout changed.

8. **Done gate is mandatory** (`scripts/verify_before_done.py`). Do not claim complete on unit tests alone.

9. **Capture proof under the goal scratch dir**, not shared `/tmp`. Concurrent goals collide there.

## When adding a lesson

```markdown
- YYYY-MM-DD: what failed → the rule you will follow next time.
```
