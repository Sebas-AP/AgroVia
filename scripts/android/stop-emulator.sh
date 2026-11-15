#!/usr/bin/env bash
# Stops the Android emulator that is currently connected, if any.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$script_dir/lib.sh"

serial="$(agrovia_emulator_serial || true)"
if [[ -z "$serial" ]]; then
    echo "No emulator is running."
    exit 0
fi

echo "Stopping $serial..."
"$agrovia_adb" -s "$serial" emu kill
