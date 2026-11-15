#!/usr/bin/env bash
# Ensures an Android emulator is running and fully booted.
#
# Idempotent: if an emulator is already connected it only waits for boot to finish.
# Otherwise it starts the AVD from AGROVIA_AVD (default: Pixel_7, then the first AVD),
# logs to the user state directory and waits until Android is ready.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$script_dir/lib.sh"

serial="$(agrovia_emulator_serial || true)"
if [[ -n "$serial" ]]; then
    if agrovia_wait_for_boot "$serial"; then
        echo "Emulator already running: $serial"
        exit 0
    fi
    echo "error: $serial is connected but never finished booting." >&2
    exit 1
fi

mapfile -t avds < <("$agrovia_emulator" -list-avds 2>/dev/null)
if (( ${#avds[@]} == 0 )); then
    echo "error: no AVD found in ${ANDROID_AVD_HOME:-the default AVD directory}." >&2
    echo "       Create one in Android Studio (Device Manager) or with avdmanager." >&2
    exit 1
fi

avd="${AGROVIA_AVD:-}"
if [[ -z "$avd" ]]; then
    avd="${avds[0]}"
    # Pixel_7 is the AVD this project was set up against; prefer it when present.
    for candidate in "${avds[@]}"; do
        if [[ "$candidate" == "Pixel_7" ]]; then
            avd="Pixel_7"
            break
        fi
    done
fi

log_file="${XDG_STATE_HOME:-$HOME/.local/state}/agrovia/emulator-$avd.log"
mkdir -p "$(dirname "$log_file")"

echo "Starting emulator '$avd' (log: $log_file)..."
# shellcheck disable=SC2086  # AGROVIA_EMULATOR_ARGS is intentionally split into flags.
nohup "$agrovia_emulator" -avd "$avd" -netdelay none -netspeed full ${AGROVIA_EMULATOR_ARGS:-} \
    >"$log_file" 2>&1 &

serial=""
for _ in $(seq 1 90); do
    serial="$(agrovia_emulator_serial || true)"
    if [[ -n "$serial" ]]; then
        break
    fi
    sleep 2
done
if [[ -z "$serial" ]]; then
    echo "error: emulator did not connect within 180s. See $log_file" >&2
    exit 1
fi

if ! agrovia_wait_for_boot "$serial"; then
    echo "error: emulator $serial did not finish booting. See $log_file" >&2
    exit 1
fi

echo "Emulator ready: $serial"
