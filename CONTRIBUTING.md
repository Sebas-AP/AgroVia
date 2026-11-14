# Contributing to AgroVia

## One-time setup

```bash
git config core.hooksPath .githooks
git lfs install
```

## Branches

Name branches by the folder you're working in: `appmovil/<topic>`, `backend/<topic>`, `modelo/<topic>`.

## Rules

- All code and docs are written in English — see `AGENTS.md`.
- `assets/protected/` is add-only — see `AGENTS.md`.
- Large model files in `Modelo/` go through Git LFS — see `Modelo/.gitattributes`.
- Opening `AppMovil/` directly in Android Studio, or the root `agrovia.code-workspace` in VSCode, both work without extra setup.
