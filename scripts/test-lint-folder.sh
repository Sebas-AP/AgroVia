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
