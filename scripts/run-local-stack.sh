#!/usr/bin/env bash
# Starts the whole local real-data stack and launches the Android app:
# Modelo (FastAPI) -> Firestore/Auth emulator -> Backend (real mode) -> seed -> Android emulator -> app.
# Safe to re-run: each step skips itself if that port/device is already up.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK="${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.config/.android/avd}"
ADB="$ANDROID_SDK/platform-tools/adb"
AVD_NAME="${AGROVIA_AVD_NAME:-Pixel_7}"
LOG_DIR="$ROOT/.run-logs"
mkdir -p "$LOG_DIR"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- ; }

wait_for() {
  local desc=$1; shift
  for _ in $(seq 1 90); do
    if "$@" >/dev/null 2>&1; then echo "  -> $desc ready"; return 0; fi
    sleep 2
  done
  echo "  !! timed out waiting for $desc" >&2
  exit 1
}

echo "[1/6] Modelo (FastAPI, real NASA POWER / ORNL DAAC)"
if port_open 8000; then
  echo "  already running on :8000"
else
  nohup bash -c "cd '$ROOT/Modelo' && .venv/bin/uvicorn agrovia_api.main:app --host 0.0.0.0 --port 8000" \
    > "$LOG_DIR/modelo.log" 2>&1 &
  disown
  wait_for "Modelo" curl -sf http://localhost:8000/api/v1/cultivos
fi

echo "[2/6] Firestore + Auth emulator"
if port_open 8080 && port_open 9099; then
  echo "  already running"
else
  nohup bash -c "cd '$ROOT' && npx firebase-tools emulators:start --only firestore,auth --project agrovia-48930" \
    > "$LOG_DIR/emulators.log" 2>&1 &
  disown
  wait_for "Firestore emulator" curl -sf http://localhost:8080
  wait_for "Auth emulator" curl -sf http://localhost:9099
fi

echo "[3/6] Backend (real data mode)"
if port_open 3000; then
  echo "  already running on :3000"
else
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/Backend/.env"
  set +a
  export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
  export PORT=3000
  nohup bash -c "cd '$ROOT/Backend' && FIRESTORE_EMULATOR_HOST=$FIRESTORE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST=$FIREBASE_AUTH_EMULATOR_HOST FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID USE_SIMULATED_PROVIDERS=$USE_SIMULATED_PROVIDERS MODELO_BASE_URL=$MODELO_BASE_URL PORT=$PORT npx tsx src/server.ts" \
    > "$LOG_DIR/backend.log" 2>&1 &
  disown
  wait_for "Backend" curl -sf http://localhost:3000/health
fi

echo "[4/6] Seeding Firestore (crop catalog + demo plot)"
(cd "$ROOT/Backend" && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_PROJECT_ID=agrovia-48930 npx tsx src/seed/runSeed.ts)

echo "[5/6] Android emulator ($AVD_NAME)"
if "$ADB" devices | grep -q "^emulator-.*device$"; then
  echo "  already running"
else
  nohup "$ANDROID_SDK/emulator/emulator" -avd "$AVD_NAME" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
    > "$LOG_DIR/emulator.log" 2>&1 &
  disown
  "$ADB" wait-for-device
  for _ in $(seq 1 90); do
    [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
    sleep 2
  done
fi

echo "[6/6] Building, installing and launching the app"
(cd "$ROOT/AppMovil/AgroViaApp/agrovia-figma-android-" && ./gradlew :app:assembleDebug)
APK="$ROOT/AppMovil/AgroViaApp/agrovia-figma-android-/app/build/outputs/apk/debug/app-debug.apk"
"$ADB" install -r "$APK"
"$ADB" shell am start -n mx.agrovia.app/.MainActivity

cat <<EOF

Stack is up:
  Modelo:                      http://localhost:8000
  Backend (dataMode: real):    http://localhost:3000
  Firestore/Auth emulator UI:  http://localhost:4000
  Android emulator:            $AVD_NAME, AGROVÍA app launched

The app's WebView bundle (assets/www/) is a locked, prebuilt demo export that makes no network
calls — it will keep showing its own "DEMOSTRACIÓN" placeholders no matter what the Backend
returns. Verify real data via the Backend's HTTP API (docs/ejemplos-api.http), not this screen,
until the frontend team rebuilds the bundle from its Figma Make source.
EOF
