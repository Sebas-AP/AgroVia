# Backend — Agent Instructions

Stack: Node.js/Express. See the root `../AGENTS.md` for project-wide rules — they apply here too, including the live API data integrity rule for anything that calls NASA APIs or the Modelo FastAPI service.

## This folder

- This is also where integration between AppMovil, Modelo, and Firebase happens — changes that wire those pieces together belong here.
- Lint/format: ESLint + Prettier. Tests: Vitest.
- JWT and encryption logic lives here; never log a raw token, password, or decrypted payload.
