# AgroVia Multi-Team Development Harness — Design

## Intent and why

AgroVia is split into three independently-owned parts — mobile app, backend, and
ML model/deployment — worked on in parallel by different team members, using
different AI coding agents (Claude Code, Codex, opencode) and different IDEs
(VSCode, Android Studio). The project also touches NASA-sourced data and
official/branding logos that must never be altered by an AI agent, whether
they live in the repo or arrive live through an API.

This harness gives every team member, in any IDE, with any supported AI agent,
the same ground rules, the same lint/test feedback loop, and hard guardrails
around sensitive and protected assets — before any product code is written.

## Goals

- One monorepo, one git history, pushed to the existing (empty) GitHub remote
  at `https://github.com/Sebas-AP/AgroVia.git`.
- Each of the three folders (`AppMovil`, `Backend`, `Modelo`) is independently
  lintable/testable and carries its own agent-instructions file plus tooling
  for its stack. The three folders start empty; CI and the pre-commit hook
  must tolerate that (skip gracefully, not fail) until each team adds its
  first real code.
- A root-level agent-instructions file with project-wide rules: protected
  assets, live-API data integrity, AI ethics, English-only documentation and
  code.
- CI (GitHub Actions) runs lint + tests per folder, triggered only by changes
  inside that folder.
- A local pre-commit hook enforces the same lint checks before a commit
  lands, without adding a runtime dependency beyond what each stack already
  needs.
- `AppMovil` stays independently openable as a Flutter project root in
  Android Studio; the repo root works as a VSCode multi-root workspace.
- Consistent behavior across agents: both `AGENTS.md` (Codex/opencode
  convention) and `CLAUDE.md` (Claude convention) exist at every level that
  needs instructions, with matching content.

## Non-goals

- Implementing the actual JWT auth/encryption logic, Firebase schema, FastAPI
  model endpoints, or Flutter screens — this harness only scaffolds tooling
  and policy, not product code.
- Configuring GitHub repo settings (branch protection, required reviewers,
  secrets) — this needs admin access and explicit confirmation from whoever
  holds it; flagged as a follow-up, not done here.
- Standing up Firebase project credentials or Render deployment — those
  require live accounts/secrets the builder doesn't have.

## Anti-goals

Would be a failure even if "it technically works":

- Any workflow or hook that silently modifies, recompresses, or regenerates
  a file already present under the protected-assets folder.
- Any committed example/fixture that fabricates NASA data (use clearly
  labeled placeholder data instead, only if example data is truly needed).
- An instruction file that only one agent actually follows — rules must read
  the same and apply the same for Claude Code, Codex, and opencode.

## Constraints

- All documentation and source code — including comments, commit messages,
  and file names — must be written entirely in English, repo-wide.
- Remote: `https://github.com/Sebas-AP/AgroVia.git` (currently empty, no
  commits, no README).
- No GitHub repo-settings changes (branch protection, secrets, collaborators)
  as part of this task.
- Pre-commit hooks must not require installing a new language runtime just
  to lint another stack (e.g. no Node-only hook framework gating Python
  commits).
- The three work folders start empty (no manifest files yet) — CI workflows
  and the pre-commit hook must detect that and skip that folder's check
  cleanly, not fail, until real code/manifests land.
- English-only is enforced by written policy only, not by an automated
  check — an accepted, explicit gap (a language heuristic is prone to false
  positives on domain terms and names).

## Decisions made

- **Repo layout:** monorepo, flat (`AppMovil/`, `Backend/`, `Modelo/` at
  root). Git initialized locally, remote `origin` set to the GitHub URL
  above, default branch `main`.
- **Protected assets:** `assets/protected/` at repo root holds official/NASA
  logos and brand assets. The root `AGENTS.md`/`CLAUDE.md` states an
  add-only rule in plain language; a pre-commit check blocks any staged
  change that modifies or deletes an existing file under that path (adding
  new files is fine).
- **Live API data integrity:** a rule in `Backend/` and `Modelo/`
  instruction files (the layers that actually touch NASA APIs) — never
  fabricate, backfill, or "correct" missing/odd values coming from an
  external API; pass data through as-is, and label any transformation
  explicitly in code comments and commit messages.
- **AI ethics section:** a short, concrete set of bullets at the root
  instructions file (no fabricated data, respect third-party/official
  branding, transparency about AI-assisted code, privacy of
  JWT/encryption-protected data), referenced — not repeated — from each
  folder's file.
- **English-only rule:** stated once at root level, referenced from every
  folder-level instructions file.
- **Per-folder tooling:**
  - `AppMovil` (Flutter): `flutter analyze` + `flutter test`, standard
    `analysis_options.yaml`.
  - `Backend` (Express/Node): ESLint (flat config) + Prettier; Vitest as the
    test runner (lighter setup, no extra transpiler config) unless the team
    already has a different preference.
  - `Modelo` (Python/FastAPI): Ruff for lint + format, pytest for tests.
- **ML model artifacts:** Git LFS is configured from the start via
  `.gitattributes` in `Modelo/` for trained-model file types (e.g. `*.pt`,
  `*.onnx`, `*.h5`, `*.pkl`), so weight files never bloat the normal git
  history that `AppMovil` and `Backend` also share. Documented in
  `Modelo`'s instructions file and `CONTRIBUTING.md`.
- **CI:** one GitHub Actions workflow per folder, each scoped with a
  `paths:` filter so it only runs when that folder changes, and each with
  an early check that skips (not fails) if the folder has no manifest file
  yet. No separate workflow for the instruction files themselves.
- **Pre-commit hook:** a single POSIX shell script at
  `.githooks/pre-commit`, enabled via
  `git config core.hooksPath .githooks` (a one-time setup step documented in
  `CONTRIBUTING.md`, since `core.hooksPath` isn't something git applies
  automatically on clone). It detects which folder(s) have staged changes
  and runs that folder's lint command (skipping cleanly if that folder has
  no manifest file yet), plus the protected-assets check.
- **VSCode:** a root `agrovia.code-workspace` multi-root file listing the
  three folders plus root, with recommended extensions per stack (Flutter,
  ESLint, Python/Ruff).
- **Android Studio:** no special config needed — `AppMovil` is already a
  valid Flutter project root; this is noted in `AppMovil`'s own
  instructions file so nobody adds unnecessary nested-project tooling.
- **CONTRIBUTING.md:** documents the branch naming convention
  (`appmovil/*`, `backend/*`, `modelo/*`), the English-only rule, how to
  enable the git hook, and a pointer to the protected-assets policy.

## What's left to the builder

- Exact Node test runner choice if the team already has a different
  preference than Vitest.
- Exact Python/FastAPI project skeleton beyond lint/test config — no
  application code is written as part of this harness.
- Firebase and Render credentials/config — explicitly not part of this
  harness.
- Any future GitHub branch-protection settings.
