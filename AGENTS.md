# AgroVia — Agent Instructions (root)

These instructions apply to every AI coding agent working in this repository (Claude Code, Codex, opencode, or any other), in any IDE. They are the single source of truth; `CLAUDE.md` in this and every folder below only points here.

## Project structure

- `AppMovil/` — Android mobile app (Kotlin, Gradle), a `WebView` wrapper around a React build.
- `Backend/` — Express backend, including integration between the mobile app, the model API, and Firebase.
- `Modelo/` — Python/FastAPI ML model and its deployment (Render).

Each folder has its own `AGENTS.md`/`CLAUDE.md` with stack-specific rules. Those rules apply in addition to this file, never instead of it.

## Language

All documentation and source code — including comments, commit messages, and file/branch names — must be written entirely in English, repo-wide. This applies even though team members communicate with each other in Spanish day to day.

## Protected assets — do not edit

`assets/protected/` holds official and NASA-sourced logos and brand assets. Once a file exists there:

- Never edit, recompress, resize, or regenerate it.
- Never delete it.
- Adding a brand-new file to that folder is fine.

A pre-commit hook enforces this for staged changes, but do not rely on it catching everything — treat the rule itself as absolute.

## Live API data integrity

`Backend/` and `Modelo/` talk to NASA APIs. When handling that data:

- Never fabricate, backfill, or "correct" missing or unusual values.
- Pass the data through as received, or apply an explicit, clearly labeled transformation (named in code and in the commit message).
- Do not invent example/fixture data that looks like real NASA data; label placeholders obviously as placeholders.

## AI ethics

- Do not fabricate data, sources, or results.
- Do not alter, imitate, or genericize official or third-party branding (see Protected assets above).
- Be transparent that code may be AI-assisted — do not hide or misrepresent authorship.
- Treat anything encrypted or JWT-protected as containing private data: never log, print, or export it in plaintext.

## Working across agents

Whichever agent you are, follow this file and the matching folder-level file exactly as written. Do not improvise project-wide rules differently from what is written here.
