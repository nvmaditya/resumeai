# Design: Tags · Settings panel · Template starters · LaTeX lint

**Date:** 2026-07-22  
**Status:** Approved  
**Mode:** ponytail full  

## Goals

1. Multi freeform **tags** per resume + dashboard filtering  
2. **Settings** as a side panel (not full page), with **Log out**  
3. **Template starters** from repo `templates/*.tex` (copy into latex body)  
4. **LaTeX lint**: static checks + tectonic compile diagnostics  

## Non-goals

- JSON Resume → per-template fill engine  
- chktex / SyncTeX / pdf.js  
- Free-form LLM chat  
- Auto-score after lint or apply  

## Decisions

| Topic | Choice |
|-------|--------|
| Tags | Multi freeform list; max 8 × 32 chars; normalize strip/dedupe |
| Settings | Right drawer; logout in panel footer; deep-link `?settings=1` |
| Templates | Starter copy only → `track=latex`, store `template_id` |
| Lint | Static always + optional tectonic without layout fallback |

## Surfaces

- `Resume.tags: list[str]` (JSON)  
- `POST /resumes` with `tags`, `template_id`  
- `GET /templates` catalog  
- `POST /resumes/{id}/lint`  
- Frontend: dashboard chips/filter; settings drawer; From template picker; Lint panel  

## Ship order

1. Tags → 2. Settings panel → 3. Template starters → 4. Lint  

Each slice commits separately; full `verify_before_done.py` before claiming done.
