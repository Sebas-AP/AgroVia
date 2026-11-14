# AgroVia Development Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the shared tooling and policy layer (git, agent instructions, lint/test, CI, Git LFS, IDE config) that lets every AgroVia team member — any folder, any AI agent, any IDE — work under the same rules from day one, with no product code written.

**Architecture:** A flat monorepo with three stack folders (`AppMovil`, `Backend`, `Modelo`), a single shared shell script (`scripts/lint-folder.sh`) that both the local pre-commit hook and the GitHub Actions workflows call so the "skip if no manifest yet" and "propagate lint failures" logic exists in exactly one place, and parallel `AGENTS.md`/`CLAUDE.md` instruction files at root and per folder where `CLAUDE.md` always just points at `AGENTS.md` so the rules can never drift between agents.

**Tech Stack:** Bash (hook + shared script), YAML (GitHub Actions), JSON (VSCode workspace), Markdown (instructions/docs), Git/Git LFS. No new runtime dependency is introduced.

**Spec:** `docs/superpowers/specs/2026-11-14-agrovia-dev-harness-design.md`

## Global Constraints

- All documentation and source code — including comments, commit messages, and file/branch names — must be written entirely in English, repo-wide.
- `assets/protected/` is add-only: an existing file there must never be modified or deleted by tooling or by an agent.
- Git LFS tracks trained-model artifact types in `Modelo/` (`*.pt`, `*.onnx`, `*.h5`, `*.pkl`) from the start.
- No GitHub repo-settings changes (branch protection, secrets, collaborators) as part of this work.
- No new language runtime may be required just to lint another stack (e.g. no Node-only hook framework gating Python commits).
- The three work folders (`AppMovil`, `Backend`, `Modelo`) start empty — every hook/CI check must skip that folder cleanly (exit 0, not fail) until its manifest file exists.
- English-only is policy only; no automated language check is in scope.
- Remote is `https://github.com/Sebas-AP/AgroVia.git`, default branch `main`, already configured locally with no commits yet.

## Review Focus

- Adding a brand-new file under `assets/protected/` (not modifying an existing one) must be allowed through the pre-commit hook, not blocked — covered in Task 6.
- A single commit that touches two work folders at once (e.g. `Backend` and `Modelo` together) must run both folders' checks, not just the first match — covered in Task 6.
- A Git LFS pattern declared in `Modelo/.gitattributes` must match files nested in subdirectories (e.g. `Modelo/models/weights.pt`), not only top-level files — covered in Task 5.
- A CI path filter on `AppMovil/**` must match nested files (e.g. `AppMovil/lib/main.dart`), not only files directly inside the folder — covered in Task 7.
- When a folder's manifest exists but its lint command actually fails, `lint-folder.sh` must propagate that non-zero exit code rather than swallowing it — otherwise the whole hook/CI safety net is silently toothless — covered in Task 2.

---

## Task 1: Repo hygiene scaffolding

**Files:**
- Create: `.gitignore`
- Create: `assets/protected/.gitkeep`

**Interfaces:**
- Produces: the `assets/protected/` path that Task 6's hook check and the root `AGENTS.md` (Task 3) both reference.

- [ ] **Step 1: Create root `.gitignore`**

Cover, at minimum, these patterns (one line each): `.env`, `*.env.local`, Flutter (`AppMovil/build/`, `AppMovil/.dart_tool/`), Node (`Backend/node_modules/`), Python (`Modelo/__pycache__/`, `Modelo/.venv/`, `Modelo/*.egg-info/`), and editor/OS noise (`.DS_Store`, `.vscode/*.log`).

- [ ] **Step 2: Create `assets/protected/.gitkeep`** (empty file, just to let git track the otherwise-empty directory)

- [ ] **Step 3: Verify**

Run: `git status --short`
Expected: only `.gitignore` and `assets/protected/.gitkeep` listed as untracked/new.

- [ ] **Step 4: Commit**

```bash
git add .gitignore assets/protected/.gitkeep
git commit -m "chore: add root gitignore and protected-assets folder"
```

---

## Task 2: Shared lint-folder script

**Files:**
- Create: `scripts/lint-folder.sh`
- Test: `scripts/test-lint-folder.sh`

**Interfaces:**
- Produces: `scripts/lint-folder.sh <folder> <manifest-relative-path> <command...>` — if `<folder>/<manifest-relative-path>` does not exist, prints `skip: <folder> has no <manifest-relative-path> yet` to stdout and exits 0 without running `<command...>`. If it does exist, runs `<command...>` with `<folder>` as the working directory and exits with that command's exact exit code.

- [ ] **Step 1: Write the failing test script**

```bash
#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/Backend"

# Case 1: manifest missing -> skip, exit 0, underlying command never runs
out="$(scripts/lint-folder.sh "$tmp/Backend" package.json false)"
[ "$?" -eq 0 ] || { echo "FAIL: missing-manifest case did not exit 0"; exit 1; }
[[ "$out" == skip:* ]] || { echo "FAIL: missing-manifest case did not print skip message"; exit 1; }

# Case 2: manifest present, command succeeds -> exit 0
touch "$tmp/Backend/package.json"
scripts/lint-folder.sh "$tmp/Backend" package.json true
[ "$?" -eq 0 ] || { echo "FAIL: passing-command case did not exit 0"; exit 1; }

# Case 3: manifest present, command fails -> exit code propagates
if scripts/lint-folder.sh "$tmp/Backend" package.json false; then
  echo "FAIL: failing-command case did not propagate failure"; exit 1
fi

echo "all lint-folder.sh cases passed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/test-lint-folder.sh`
Expected: FAIL — `scripts/lint-folder.sh: No such file or directory`

- [ ] **Step 3: Implement `scripts/lint-folder.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
folder="$1"; manifest="$2"; shift 2
if [ ! -f "$folder/$manifest" ]; then
  echo "skip: $folder has no $manifest yet"
  exit 0
fi
cd "$folder"
exec "$@"
```

Make it executable (`chmod +x scripts/lint-folder.sh`). Using `exec` is what makes the exit code propagate exactly (step 1's Case 3 depends on this, not on `set -e` alone).

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x scripts/test-lint-folder.sh && bash scripts/test-lint-folder.sh`
Expected: `all lint-folder.sh cases passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lint-folder.sh scripts/test-lint-folder.sh
git commit -m "feat: add shared lint-folder script with skip-if-no-manifest behavior"
```

---

## Task 3: Root agent instructions

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: the root policy text that Tasks 4, 5, 6, 7, 8 all reference by relative path (`../AGENTS.md` from each folder) — do not duplicate this text elsewhere, only point to it.

- [ ] **Step 1: Create root `AGENTS.md`**

```markdown
# AgroVia — Agent Instructions (root)

These instructions apply to every AI coding agent working in this repository (Claude Code, Codex, opencode, or any other), in any IDE. They are the single source of truth; `CLAUDE.md` in this and every folder below only points here.

## Project structure

- `AppMovil/` — Flutter mobile app.
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
```

- [ ] **Step 2: Create root `CLAUDE.md`**

```markdown
# AgroVia — Claude Code Instructions

See `AGENTS.md` in this directory. These rules apply to Claude Code exactly as written there.
```

- [ ] **Step 3: Verify**

Run: `grep -q "assets/protected" AGENTS.md && grep -q "AGENTS.md" CLAUDE.md && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: add root agent instructions"
```

---

## Task 4: Per-folder agent instructions

**Files:**
- Create: `AppMovil/AGENTS.md`, `AppMovil/CLAUDE.md`
- Create: `Backend/AGENTS.md`, `Backend/CLAUDE.md`
- Create: `Modelo/AGENTS.md`, `Modelo/CLAUDE.md`

**Interfaces:**
- Consumes: root `AGENTS.md` (Task 3) by relative reference `../AGENTS.md`.

- [ ] **Step 1: Create `AppMovil/AGENTS.md`**

```markdown
# AppMovil — Agent Instructions

Stack: Flutter/Dart. See the root `../AGENTS.md` for project-wide rules (language, protected assets, ethics) — they apply here too.

## This folder

- This is a standalone Flutter project root: `flutter pub get`, `flutter run`, and opening it directly in Android Studio all work without extra configuration. Do not restructure it to work around that.
- Lint: `flutter analyze`. Tests: `flutter test`.
- Keep `pubspec.yaml` as the single source of dependencies; do not vendor packages manually.
```

- [ ] **Step 2: Create `AppMovil/CLAUDE.md`**

```markdown
# AppMovil — Claude Code Instructions

See `AGENTS.md` in this directory. These rules apply to Claude Code exactly as written there.
```

- [ ] **Step 3: Create `Backend/AGENTS.md`**

```markdown
# Backend — Agent Instructions

Stack: Node.js/Express. See the root `../AGENTS.md` for project-wide rules — they apply here too, including the live API data integrity rule for anything that calls NASA APIs or the Modelo FastAPI service.

## This folder

- This is also where integration between AppMovil, Modelo, and Firebase happens — changes that wire those pieces together belong here.
- Lint/format: ESLint + Prettier. Tests: Vitest.
- JWT and encryption logic lives here; never log a raw token, password, or decrypted payload.
```

- [ ] **Step 4: Create `Backend/CLAUDE.md`**

```markdown
# Backend — Claude Code Instructions

See `AGENTS.md` in this directory. These rules apply to Claude Code exactly as written there.
```

- [ ] **Step 5: Create `Modelo/AGENTS.md`**

```markdown
# Modelo — Agent Instructions

Stack: Python/FastAPI, deployed on Render. See the root `../AGENTS.md` for project-wide rules — they apply here too, including the live API data integrity rule.

## This folder

- Lint/format: Ruff. Tests: pytest.
- Trained model weights and other large artifacts are tracked with Git LFS (see `.gitattributes`) — never commit a weight file of a type not already listed there without adding it to `.gitattributes` first.
```

- [ ] **Step 6: Create `Modelo/CLAUDE.md`**

```markdown
# Modelo — Claude Code Instructions

See `AGENTS.md` in this directory. These rules apply to Claude Code exactly as written there.
```

- [ ] **Step 7: Verify**

Run: `for d in AppMovil Backend Modelo; do grep -q "../AGENTS.md" "$d/AGENTS.md" && grep -q "AGENTS.md" "$d/CLAUDE.md" || echo "MISSING: $d"; done; echo done`
Expected: `done` with no `MISSING:` lines.

- [ ] **Step 8: Commit**

```bash
git add AppMovil/AGENTS.md AppMovil/CLAUDE.md Backend/AGENTS.md Backend/CLAUDE.md Modelo/AGENTS.md Modelo/CLAUDE.md
git commit -m "docs: add per-folder agent instructions"
```

---

## Task 5: Git LFS for model artifacts

**Files:**
- Create: `Modelo/.gitattributes`
- Test: `scripts/test-modelo-lfs.sh`

**Interfaces:**
- Produces: LFS tracking for `*.pt`, `*.onnx`, `*.h5`, `*.pkl` anywhere under `Modelo/`.

- [ ] **Step 1: Write the failing test script**

```bash
#!/usr/bin/env bash
set -euo pipefail
for f in Modelo/model.pt Modelo/models/nested/weights.onnx Modelo/x.h5 Modelo/x.pkl; do
  attr="$(git check-attr filter "$f")"
  [[ "$attr" == *"filter: lfs"* ]] || { echo "FAIL: $f is not LFS-tracked ($attr)"; exit 1; }
done
echo "all modelo LFS cases passed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/test-modelo-lfs.sh`
Expected: FAIL — reports `filter: unspecified` for each path (no `.gitattributes` yet).

- [ ] **Step 3: Create `Modelo/.gitattributes`**

```gitattributes
*.pt filter=lfs diff=lfs merge=lfs -text
*.onnx filter=lfs diff=lfs merge=lfs -text
*.h5 filter=lfs diff=lfs merge=lfs -text
*.pkl filter=lfs diff=lfs merge=lfs -text
```

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x scripts/test-modelo-lfs.sh && bash scripts/test-modelo-lfs.sh`
Expected: `all modelo LFS cases passed`

(This works via `git check-attr` reading `.gitattributes` directly — it does not require the `git-lfs` binary to be installed to verify the attribute mapping.)

- [ ] **Step 5: Commit**

```bash
git add Modelo/.gitattributes scripts/test-modelo-lfs.sh
git commit -m "feat: track model artifacts with git lfs in Modelo"
```

---

## Task 6: Pre-commit hook

**Files:**
- Create: `.githooks/pre-commit`
- Test: `scripts/test-pre-commit-hook.sh`

**Interfaces:**
- Consumes: `scripts/lint-folder.sh <folder> <manifest> <command...>` (Task 2).
- Produces: `.githooks/pre-commit`, activated by `git config core.hooksPath .githooks` (documented in Task 8's `CONTRIBUTING.md`).

- [ ] **Step 1: Write the failing test script**

```bash
#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -r "$(git rev-parse --show-toplevel)/.githooks" "$tmp/.githooks"
cp "$(git rev-parse --show-toplevel)/scripts/lint-folder.sh" "$tmp/lint-folder.sh.ref"
( cd "$tmp" && git init -q && mkdir -p scripts assets/protected AppMovil Backend Modelo \
  && cp lint-folder.sh.ref scripts/lint-folder.sh && chmod +x scripts/lint-folder.sh \
  && git add -A && git commit -qm init )

run_hook() { ( cd "$tmp" && bash .githooks/pre-commit ); }

# Case 1: new file under assets/protected -> allowed
( cd "$tmp" && echo logo > assets/protected/new-logo.txt && git add assets/protected/new-logo.txt )
run_hook || { echo "FAIL: adding a new protected asset was blocked"; exit 1; }

# Case 2: modifying an existing protected asset -> blocked
( cd "$tmp" && git commit -qm "add logo" && echo changed > assets/protected/new-logo.txt && git add assets/protected/new-logo.txt )
if run_hook; then echo "FAIL: modifying an existing protected asset was allowed"; exit 1; fi
( cd "$tmp" && git reset -q -- assets/protected/new-logo.txt && git checkout -q -- assets/protected/new-logo.txt )

# Case 3: touching two empty work folders at once -> both skip cleanly, hook passes
( cd "$tmp" && echo a > Backend/readme.txt && echo b > Modelo/readme.txt && git add Backend/readme.txt Modelo/readme.txt )
run_hook || { echo "FAIL: multi-folder commit with empty folders was blocked"; exit 1; }

echo "all pre-commit hook cases passed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/test-pre-commit-hook.sh`
Expected: FAIL — `.githooks/pre-commit: No such file or directory` (directory doesn't exist yet either).

- [ ] **Step 3: Implement `.githooks/pre-commit`**

```bash
#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if git diff --cached --name-status -- assets/protected | grep -qE '^[MD]'; then
  echo "ERROR: files under assets/protected must never be modified or deleted (add-only)." >&2
  exit 1
fi

staged="$(git diff --cached --name-only)"

check_folder() {
  local folder="$1"; shift
  if echo "$staged" | grep -q "^$folder/"; then
    scripts/lint-folder.sh "$folder" "$@"
  fi
}

check_folder AppMovil pubspec.yaml flutter analyze
check_folder Backend package.json npx eslint .
check_folder Modelo requirements.txt ruff check .
```

Make it executable (`chmod +x .githooks/pre-commit`).

- [ ] **Step 4: Run test to verify it passes**

Run: `chmod +x scripts/test-pre-commit-hook.sh && bash scripts/test-pre-commit-hook.sh`
Expected: `all pre-commit hook cases passed`

- [ ] **Step 5: Commit**

```bash
git add .githooks/pre-commit scripts/test-pre-commit-hook.sh
git commit -m "feat: add pre-commit hook enforcing protected-assets and per-folder lint"
```

---

## Task 7: GitHub Actions CI workflows

**Files:**
- Create: `.github/workflows/appmovil-ci.yml`
- Create: `.github/workflows/backend-ci.yml`
- Create: `.github/workflows/modelo-ci.yml`
- Test: `scripts/test-ci-workflows.sh`

**Interfaces:**
- Consumes: `scripts/lint-folder.sh <folder> <manifest> <command...>` (Task 2).

- [ ] **Step 1: Write the failing test script**

```bash
#!/usr/bin/env bash
set -euo pipefail
for f in .github/workflows/appmovil-ci.yml .github/workflows/backend-ci.yml .github/workflows/modelo-ci.yml; do
  python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$f" || { echo "FAIL: $f is not valid YAML"; exit 1; }
  grep -q "scripts/lint-folder.sh" "$f" || { echo "FAIL: $f does not use the shared lint-folder.sh"; exit 1; }
done

# Path-filter glob must match nested files, not just top-level ones
case "AppMovil/lib/main.dart" in
  AppMovil/**) ;;
  *) echo "FAIL: AppMovil/** does not match a nested path"; exit 1 ;;
esac

echo "all ci workflow checks passed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/test-ci-workflows.sh`
Expected: FAIL — `.github/workflows/appmovil-ci.yml` not found.

- [ ] **Step 3: Create `.github/workflows/appmovil-ci.yml`**

```yaml
name: AppMovil CI
on:
  push:
    paths: ["AppMovil/**"]
  pull_request:
    paths: ["AppMovil/**"]
jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        if: hashFiles('AppMovil/pubspec.yaml') != ''
      - run: scripts/lint-folder.sh AppMovil pubspec.yaml flutter analyze
      - run: scripts/lint-folder.sh AppMovil pubspec.yaml flutter test
```

- [ ] **Step 4: Create `.github/workflows/backend-ci.yml`**

```yaml
name: Backend CI
on:
  push:
    paths: ["Backend/**"]
  pull_request:
    paths: ["Backend/**"]
jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
        if: hashFiles('Backend/package.json') != ''
      - run: scripts/lint-folder.sh Backend package.json npm ci
      - run: scripts/lint-folder.sh Backend package.json npx eslint .
      - run: scripts/lint-folder.sh Backend package.json npx vitest run
```

- [ ] **Step 5: Create `.github/workflows/modelo-ci.yml`**

```yaml
name: Modelo CI
on:
  push:
    paths: ["Modelo/**"]
  pull_request:
    paths: ["Modelo/**"]
jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
        if: hashFiles('Modelo/requirements.txt') != ''
      - run: scripts/lint-folder.sh Modelo requirements.txt ruff check .
      - run: scripts/lint-folder.sh Modelo requirements.txt pytest
```

- [ ] **Step 6: Run test to verify it passes**

Run: `chmod +x scripts/test-ci-workflows.sh && bash scripts/test-ci-workflows.sh`
Expected: `all ci workflow checks passed`

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/appmovil-ci.yml .github/workflows/backend-ci.yml .github/workflows/modelo-ci.yml scripts/test-ci-workflows.sh
git commit -m "feat: add per-folder GitHub Actions CI workflows"
```

---

## Task 8: VSCode workspace and CONTRIBUTING guide

**Files:**
- Create: `agrovia.code-workspace`
- Create: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: Task 3's root `AGENTS.md` (referenced, not duplicated), Task 6's `core.hooksPath` setup step, Task 5's Git LFS setup.

- [ ] **Step 1: Create `agrovia.code-workspace`**

```json
{
  "folders": [
    { "path": "." },
    { "path": "AppMovil" },
    { "path": "Backend" },
    { "path": "Modelo" }
  ],
  "extensions": {
    "recommendations": [
      "Dart-Code.flutter",
      "Dart-Code.dart-code",
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "charliermarsh.ruff"
    ]
  }
}
```

- [ ] **Step 2: Create `CONTRIBUTING.md`**

```markdown
# Contributing to AgroVia

## One-time setup

```bash
git config core.hooksPath .githooks
git lfs install
```

## Branches

Name branches by the folder you're working in: `appmovil/<topic>`, `backend/<topic>`, `modelo/<topic>`.

## Rules

- All code and docs are written in English — see `AGENTS.md`.
- `assets/protected/` is add-only — see `AGENTS.md`.
- Large model files in `Modelo/` go through Git LFS — see `Modelo/.gitattributes`.
- Opening `AppMovil/` directly in Android Studio, or the root `agrovia.code-workspace` in VSCode, both work without extra setup.
```

- [ ] **Step 3: Verify**

Run: `python3 -c "import json; json.load(open('agrovia.code-workspace'))" && grep -q "core.hooksPath" CONTRIBUTING.md && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add agrovia.code-workspace CONTRIBUTING.md
git commit -m "docs: add vscode workspace and contributing guide"
```

---

## Final step: push

- [ ] **Step 1: Push to the configured remote**

Run: `git push -u origin main`
Expected: branch `main` created on `https://github.com/Sebas-AP/AgroVia.git` with all 8 commits.
