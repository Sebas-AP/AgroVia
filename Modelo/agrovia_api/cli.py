"""Command-line entry point for evaluating a parcel JSON file offline.

Usage::

    python -m agrovia_api.cli [path/to/parcela.json]

Without an argument it evaluates the bundled example parcel file located at
``Backend/parcela_ejemplo.json``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .config import DEFAULT_PARCEL_EXAMPLE
from .main import load_parcela_from_file
from .service import build_default_service


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    path = Path(argv[0]) if argv else DEFAULT_PARCEL_EXAMPLE

    if not path.exists():
        print(f"Parcel file not found: {path}", file=sys.stderr)
        return 2

    parcela = load_parcela_from_file(path)
    service = build_default_service()
    result = service.evaluate(parcela)
    print(json.dumps(result.model_dump(mode="json"), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
