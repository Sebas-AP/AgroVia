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

# Case 3: touching two empty work folders at once -> both checks actually run (not just the first)
( cd "$tmp" && echo a > Backend/readme.txt && echo b > Modelo/readme.txt && git add Backend/readme.txt Modelo/readme.txt )
out="$(run_hook)" || { echo "FAIL: multi-folder commit with empty folders was blocked"; exit 1; }
[[ "$out" == *"skip: Backend has no package.json yet"* ]] || { echo "FAIL: Backend check did not run"; exit 1; }
[[ "$out" == *"skip: Modelo has no requirements.txt yet"* ]] || { echo "FAIL: Modelo check did not run"; exit 1; }
( cd "$tmp" && git reset -q -- Backend/readme.txt Modelo/readme.txt )

# Case 4: renaming a protected asset without editing it -> still blocked (it deletes the old path)
( cd "$tmp" && git mv assets/protected/new-logo.txt assets/protected/renamed-logo.txt && git add -A )
if run_hook; then echo "FAIL: renaming a protected asset without editing was allowed"; exit 1; fi
( cd "$tmp" && git reset -q && rm -f assets/protected/renamed-logo.txt && git checkout -q -- assets/protected/new-logo.txt )

# Case 5: renaming AND editing a protected asset -> blocked (git would call this a rename, not a plain add)
( cd "$tmp" && git mv assets/protected/new-logo.txt assets/protected/renamed-logo2.txt && echo tampered > assets/protected/renamed-logo2.txt && git add -A )
if run_hook; then echo "FAIL: renaming and editing a protected asset was allowed"; exit 1; fi
( cd "$tmp" && git reset -q && rm -f assets/protected/renamed-logo2.txt && git checkout -q -- assets/protected/new-logo.txt )

# Case 6: a very large staged set must not silently skip a folder's check (SIGPIPE/pipefail regression)
( cd "$tmp" && mkdir -p Backend/bulk && cd Backend/bulk && touch file_{1..8000}.txt && cd "$tmp" && git add Backend/bulk )
out="$(run_hook)" || { echo "FAIL: large staged set blocked the hook unexpectedly"; exit 1; }
[[ "$out" == *"skip: Backend has no package.json yet"* ]] || { echo "FAIL: Backend check was silently skipped under a large staged set"; exit 1; }

echo "all pre-commit hook cases passed"
