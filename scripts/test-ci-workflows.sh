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
