# AppMovil — Agent Instructions

Stack: Flutter/Dart. See the root `../AGENTS.md` for project-wide rules (language, protected assets, ethics) — they apply here too.

## This folder

- This is a standalone Flutter project root: `flutter pub get`, `flutter run`, and opening it directly in Android Studio all work without extra configuration. Do not restructure it to work around that.
- Lint: `flutter analyze`. Tests: `flutter test`.
- Keep `pubspec.yaml` as the single source of dependencies; do not vendor packages manually.
