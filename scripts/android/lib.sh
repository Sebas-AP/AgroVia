#!/usr/bin/env bash
# Shared helpers for the Android emulator scripts.
#
# Sourced by ensure-emulator.sh, run-app.sh and stop-emulator.sh. It resolves the
# Android SDK, adb, the emulator binary and the AVD home directory the same way for
# every script, so none of them hardcode machine-specific paths.
#
# Overridable environment variables:
#   ANDROID_HOME / ANDROID_SDK_ROOT  Android SDK location (falls back to local.properties)
#   ANDROID_AVD_HOME                 AVD directory (falls back to the usual XDG locations)
#   AGROVIA_AVD                      AVD name to boot (falls back to Pixel_7, then the first AVD)
#   AGROVIA_EMULATOR_ARGS            Extra flags passed to the emulator command

if [[ -n "${AGROVIA_ANDROID_LIB_LOADED:-}" ]]; then
    return 0
fi
AGROVIA_ANDROID_LIB_LOADED=1

agrovia_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
agrovia_gradle_dir="$agrovia_repo_root/AppMovil/AgroViaApp/agrovia-figma-android-"
agrovia_apk="$agrovia_gradle_dir/app/build/outputs/apk/debug/app-debug.apk"
agrovia_local_properties="$agrovia_gradle_dir/local.properties"

_agrovia_resolve_sdk() {
    local sdk=""
    if [[ -n "${ANDROID_HOME:-}" ]]; then
        sdk="$ANDROID_HOME"
    elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
        sdk="$ANDROID_SDK_ROOT"
    elif [[ -f "$agrovia_local_properties" ]]; then
        # Gradle stores the SDK path here; strip CR in case the file came from Windows.
        sdk="$(sed -n 's/^sdk\.dir=//p' "$agrovia_local_properties" | tail -n 1 | tr -d '\r')"
    fi
    # Common Linux install location used by Android Studio's default setup.
    if [[ -z "$sdk" && -d "$HOME/Android/Sdk" ]]; then
        sdk="$HOME/Android/Sdk"
    fi
    printf '%s' "$sdk"
}

agrovia_sdk="$(_agrovia_resolve_sdk)"
if [[ -z "$agrovia_sdk" || ! -d "$agrovia_sdk" ]]; then
    echo "error: Android SDK not found." >&2
    echo "       Set ANDROID_HOME or add sdk.dir to $agrovia_local_properties." >&2
    exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-$agrovia_sdk}"

_agrovia_resolve_avd_home() {
    if [[ -n "${ANDROID_AVD_HOME:-}" ]]; then
        printf '%s' "$ANDROID_AVD_HOME"
        return
    fi
    local candidate
    for candidate in \
        "$HOME/.android/avd" \
        "${XDG_CONFIG_HOME:-$HOME/.config}/.android/avd" \
        "$HOME/.config/.android/avd"; do
        if compgen -G "$candidate/*.ini" >/dev/null 2>&1; then
            printf '%s' "$candidate"
            return
        fi
    done
}

agrovia_avd_home="$(_agrovia_resolve_avd_home)"
if [[ -n "$agrovia_avd_home" ]]; then
    export ANDROID_AVD_HOME="$agrovia_avd_home"
fi

if [[ -x "$agrovia_sdk/platform-tools/adb" ]]; then
    agrovia_adb="$agrovia_sdk/platform-tools/adb"
else
    agrovia_adb="$(command -v adb || true)"
fi
if [[ -z "$agrovia_adb" ]]; then
    echo "error: adb not found. Install Android SDK Platform-Tools." >&2
    exit 1
fi

if [[ -x "$agrovia_sdk/emulator/emulator" ]]; then
    agrovia_emulator="$agrovia_sdk/emulator/emulator"
else
    agrovia_emulator="$(command -v emulator || true)"
fi
if [[ -z "$agrovia_emulator" ]]; then
    echo "error: Android emulator not found. Install it with sdkmanager \"emulator\"." >&2
    exit 1
fi

# Prints the serial of a connected, online emulator, if any.
agrovia_emulator_serial() {
    "$agrovia_adb" devices | awk '$1 ~ /^emulator-[0-9]+$/ && $2 == "device" { print $1; exit }'
}

# Waits until Android reports that boot has completed.
# Usage: agrovia_wait_for_boot <serial> [timeout_seconds]
agrovia_wait_for_boot() {
    local serial="$1"
    local timeout="${2:-240}"
    local started=$SECONDS
    local booted=""
    while (( SECONDS - started < timeout )); do
        booted="$("$agrovia_adb" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r[:space:]')"
        if [[ "$booted" == "1" ]]; then
            return 0
        fi
        sleep 2
    done
    return 1
}
