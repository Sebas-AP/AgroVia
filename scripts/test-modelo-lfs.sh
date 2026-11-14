#!/usr/bin/env bash
set -euo pipefail
for f in Modelo/model.pt Modelo/models/nested/weights.onnx Modelo/x.h5 Modelo/x.pkl; do
  attr="$(git check-attr filter "$f")"
  [[ "$attr" == *"filter: lfs"* ]] || { echo "FAIL: $f is not LFS-tracked ($attr)"; exit 1; }
done
echo "all modelo LFS cases passed"
