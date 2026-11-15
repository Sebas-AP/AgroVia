"""Loaders for the static AgroVia catalogues (crops and municipalities)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import CROPS_PATH, MUNICIPALITIES_PATH


def load_crops(path: Path = CROPS_PATH) -> dict[str, dict[str, Any]]:
    """Return the INIFAP crop catalogue keyed by ``cultivo_id``."""
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def load_municipalities(path: Path = MUNICIPALITIES_PATH) -> list[dict[str, Any]]:
    """Return the Durango municipality catalogue as a list of records."""
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)
