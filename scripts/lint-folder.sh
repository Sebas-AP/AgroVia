#!/usr/bin/env bash
set -euo pipefail
folder="$1"; manifest="$2"; shift 2
if [ ! -f "$folder/$manifest" ]; then
  echo "skip: $folder has no $manifest yet"
  exit 0
fi
cd "$folder"
exec "$@"
