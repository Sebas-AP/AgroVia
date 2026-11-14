# Modelo — Agent Instructions

Stack: Python/FastAPI, deployed on Render. See the root `../AGENTS.md` for project-wide rules — they apply here too, including the live API data integrity rule.

## This folder

- Lint/format: Ruff. Tests: pytest.
- Trained model weights and other large artifacts are tracked with Git LFS (see `.gitattributes`) — never commit a weight file of a type not already listed there without adding it to `.gitattributes` first.
