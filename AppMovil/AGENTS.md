# AppMovil — Agent Instructions

Stack: Android (Kotlin, Gradle) — a native `WebView` wrapper around a React build exported from
Figma Make. See the root `../AGENTS.md` for project-wide rules (language, protected assets, ethics)
— they apply here too.

## This folder

- The Gradle project root is `AppMovil/AgroViaApp/agrovia-figma-android-/`; open that folder
  directly in Android Studio, not `AppMovil/` itself.
- Build: `./gradlew :app:assembleDebug` from the Gradle project root. No test suite yet.
- The `WebView` loads a prebuilt bundle from `app/src/main/assets/www/`. That bundle's source is
  not in this repository — see root `INTEGRACION.md` §0. Never hand-edit the compiled/minified
  JS/CSS under `assets/www/`.
