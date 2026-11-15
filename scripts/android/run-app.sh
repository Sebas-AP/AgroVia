#!/usr/bin/env bash
# Builds, installs and launches the AgroVia debug app on a connected emulator.
#
# By default it also starts the emulator and rebuilds the APK. Set
# AGROVIA_SKIP_EMULATOR=1 or AGROVIA_SKIP_BUILD=1 to skip those steps.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$script_dir/lib.sh"

if [[ "${AGROVIA_SKIP_EMULATOR:-0}" != "1" ]]; then
    "$script_dir/ensure-emulator.sh"
fi

if [[ "${AGROVIA_SKIP_BUILD:-0}" != "1" ]]; then
    echo "Building debug APK..."
    (cd "$agrovia_gradle_dir" && ./gradlew :app:assembleDebug --console=plain)
fi

if [[ ! -f "$agrovia_apk" ]]; then
    echo "error: APK not found at $agrovia_apk (run the build first)." >&2
    exit 1
fi

serial="$(agrovia_emulator_serial || true)"
if [[ -z "$serial" ]]; then
    echo "error: no emulator connected; run ensure-emulator.sh first." >&2
    exit 1
fi

echo "Installing $agrovia_apk on $serial..."
"$agrovia_adb" -s "$serial" install -r "$agrovia_apk"

echo "Launching mx.agrovia.app/.MainActivity..."
"$agrovia_adb" -s "$serial" shell am start -W -n mx.agrovia.app/.MainActivity

echo "AgroVia is running on $serial."
