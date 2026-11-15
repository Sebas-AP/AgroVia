#!/usr/bin/env bash
set -euo pipefail

# Guards against the regression found in defect (j): a pattern declared filter=lfs in
# Modelo/.gitattributes while the matching file is actually committed as a normal blob. Checks
# real, currently-committed files (git ls-files), not hypothetical paths that don't exist.

patterns="$(grep -oE '^\*\.[A-Za-z0-9]+' Modelo/.gitattributes | sed 's/^\*//')"
lfs_files="$(git lfs ls-files -n 2>/dev/null || true)"

fail=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  for ext in $patterns; do
    case "$file" in
      *"$ext")
        attr="$(git check-attr filter -- "$file")"
        if [[ "$attr" == *"filter: lfs"* ]] && ! grep -qxF "$file" <<<"$lfs_files"; then
          echo "FAIL: $file matches an LFS-declared pattern but is not an actual LFS pointer"
          fail=1
        fi
        ;;
    esac
  done
done < <(git ls-files Modelo)
[ "$fail" -eq 0 ] || exit 1

# modelo_agrovia.joblib: the project decided to drop *.joblib from LFS rather than rewrite
# already-merged history for a 506 KB file (see INTEGRACION.md defect (j)) — guard against the
# pattern silently coming back and leaving the real blob out of sync with .gitattributes again.
joblib_attr="$(git check-attr filter -- Modelo/modelo_agrovia.joblib)"
if [[ "$joblib_attr" == *"filter: lfs"* ]]; then
  echo "FAIL: modelo_agrovia.joblib is declared filter=lfs again but was never migrated out of being a normal blob"
  exit 1
fi

echo "all modelo LFS cases passed"
