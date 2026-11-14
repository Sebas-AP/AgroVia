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
