"""Test configuration: make the ``agrovia_api`` package importable."""

from __future__ import annotations

import sys
from pathlib import Path

MODELO_DIR = Path(__file__).resolve().parent
if str(MODELO_DIR) not in sys.path:
    sys.path.insert(0, str(MODELO_DIR))
