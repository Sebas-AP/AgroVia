#!/usr/bin/env bash
set -euo pipefail
for f in .github/workflows/appmovil-ci.yml .github/workflows/backend-ci.yml .github/workflows/modelo-ci.yml; do
  python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" "$f" || { echo "FAIL: $f is not valid YAML"; exit 1; }
  grep -q "scripts/lint-folder.sh" "$f" || { echo "FAIL: $f does not use the shared lint-folder.sh"; exit 1; }
done

# Path-filter must declare the recursive glob literally, on both push and pull_request,
# not just happen to match it incidentally
declare -A folder_for=(
  [.github/workflows/appmovil-ci.yml]=AppMovil
  [.github/workflows/backend-ci.yml]=Backend
  [.github/workflows/modelo-ci.yml]=Modelo
)
for f in "${!folder_for[@]}"; do
  folder="${folder_for[$f]}"
  count="$(grep -coF "\"$folder/**\"" "$f")"
  [ "$count" -ge 2 ] || { echo "FAIL: $f does not declare \"$folder/**\" as both push and pull_request path filter"; exit 1; }
done

# Modelo CI must install its dependencies (incl. ruff/pytest) before linting, or the lint step
# will fail with "command not found" as soon as requirements.txt exists
grep -q "pip install" .github/workflows/modelo-ci.yml || { echo "FAIL: modelo-ci.yml does not install dependencies before linting"; exit 1; }

echo "all ci workflow checks passed"
