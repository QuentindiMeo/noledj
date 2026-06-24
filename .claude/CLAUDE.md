# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Noledj** is a personal, French-language study tracker for a single learner following a structured ~5-month curriculum (2026-06-01 → 2026-10-15, ~312h). The whole app is one self-contained HTML file (`avancement.html`) with **no build system, no framework, and no runtime dependencies** — vanilla JS + CSS. Progress is stored entirely in the browser's `localStorage` (key `noledj_v1`); there is no server or backend.

## Commands

```bash
# Regenerate the COURSES index in avancement.html from the markdown on disk
python3 inject_courses.py
python3 inject_courses.py --dry-run    # report only, no write

# Produce a minified single-file build
python3 minify.py                      # writes avancement.min.html
python3 minify.py --stats              # size/gzip report only, no write

# Serve locally — REQUIRED: course markdown is loaded via fetch(), which fails
# over file:// (CORS). Open http://localhost:8000/avancement.html
python3 -m http.server 8000
```

There are no tests, linter, or package manifest.

## Architecture

Three coupled pieces that must stay in sync:

1. **`avancement.html`** — the app. Key globals near the bottom `<script>`:
   - `PHASES` — the source-of-truth timeline: 5 phases → weeks → sessions. Each session has `{ id:"sNN", day, date, hours, label, details }`. `date` drives "today" highlighting and expected-vs-actual hour stats.
   - `COURSES` — a generated index `{ "sNN": [{title, path}, ...] }` mapping each session to its course markdown files. **Do not hand-edit**; it is produced by `inject_courses.py` (see below). At rest it is the single line `const COURSES = {};`.
   - `renderMarkdown()` / `mdInline()` — a **custom, hand-rolled Markdown renderer** (headings, lists, tables, fenced code, blockquotes, hr). No external Markdown library. If course rendering looks wrong, the bug is here, not in a dependency.
   - Course bodies are fetched lazily on demand (`fetchMarkdown`, cached in `_mdCache`) and shown in a tabbed modal (`openCourse`).

2. **`inject_courses.py`** — builds `COURSES` and injects it into `avancement.html`. The mapping `SESSION_MODULES` (session id → `[(course_dir, [filenames])]`) lives here. It reads only each file's first line for the H1 title; the Markdown body stays on disk and is served at runtime. Re-running is idempotent (it replaces the existing `const COURSES = {...};` line).

3. **`courses/weight{0,1,2}/<Topic>/Module-*.md`** — the course content. `weightN` = priority tier (0 highest). Files named `Module-NN.md`; a `+P` suffix (e.g. `Module-07+P.md`) marks a module that includes the mini-project. These are the files referenced by `SESSION_MODULES` and fetched at runtime.

**The critical coupling:** a session string `sNN` appears in both `PHASES` (timeline) and `SESSION_MODULES` (course mapping). When you add/rename/move a course `.md` file or add a session:

- update `SESSION_MODULES` in `inject_courses.py`, then **re-run `python3 inject_courses.py`** so `COURSES` matches;
- the UI's `hasCourse(sid)` only shows a "course" affordance when `COURSES[sid]` exists, so a session in `PHASES` with no `SESSION_MODULES` entry simply renders without course content (this is intentional for revision/buffer sessions).

After editing `avancement.html`, regenerate `avancement.min.html` with `minify.py` if a minified build is needed.

## Supporting files

- `resources/` — source curriculum docs, not used by the app at runtime: `parcours.md` (master learning plan / skeleton), `chronologie.md`, `glossaire.md`, `gogetit.md`, and `priority{0,1,2}/*.md` (per-competence summaries the `courses/` modules are expanded from).
- `avancement copy 2.html` — an older backup snapshot, not part of the app.

## Conversation direction

Keep your responses short. Check for recent feature changes. Emphasize on the purpose and upsides/downsides of presented features.
If the question is in French, answer in French. If the question is in English, answer in English.
If the question is in French, segments in English must be italicized.
