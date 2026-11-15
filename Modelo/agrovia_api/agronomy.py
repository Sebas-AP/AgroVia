"""Agronomic utilities: trapezoidal suitability and phenological windows.

The INIFAP catalogue stores each environmental requirement as a trapezoid
``[a, b, c, d]``: no score below ``a``, a linear ramp from ``a`` to ``b``, an
optimum plateau between ``b`` and ``c``, and a linear ramp down to ``d``.
"""

from __future__ import annotations

import unicodedata
from datetime import date, timedelta

TRAPEZOID_KEYS = ("lluvia_mm", "temp_media_c", "temp_min_ciclo_c", "radiacion_mj_m2")

# Fraction of the maximum cycle length that has elapsed by each stage. The
# analysis window starts at sowing and ends at ``sowing + fraction * cycle``
# (capped at "today"), which keeps the satellite queries aligned with the
# current state of the crop.
STAGE_FRACTIONS: dict[str, float] = {
    "siembra": 0.15,
    "emergencia": 0.20,
    "vegetativo": 0.40,
    "floracion": 0.60,
    "fructificacion": 0.80,
    "madurez": 0.95,
    "cosecha": 1.00,
    "desconocida": 1.00,
}

# Free-text Spanish synonyms mapped onto the canonical stage names above.
STAGE_SYNONYMS: dict[str, str] = {
    "siembra": "siembra",
    "plantula": "emergencia",
    "plantula emergencia": "emergencia",
    "emergencia": "emergencia",
    "germinacion": "emergencia",
    "vegetativo": "vegetativo",
    "desarrollo": "vegetativo",
    "desarrollo vegetativo": "vegetativo",
    "crecimiento": "vegetativo",
    "floracion": "floracion",
    "flor": "floracion",
    "fructificacion": "fructificacion",
    "llenado": "fructificacion",
    "llenado de grano": "fructificacion",
    "llenado grano": "fructificacion",
    "grano": "fructificacion",
    "madurez": "madurez",
    "madurez fisiologica": "madurez",
    "cosecha": "cosecha",
    "recoleccion": "cosecha",
}


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(without_accents.lower().strip().split())


def normalize_stage(raw_stage: str) -> str:
    """Map a free-text growth stage onto a canonical stage name."""
    return STAGE_SYNONYMS.get(_normalize(raw_stage), "desconocida")


def analysis_window(
    sowing_date: date,
    stage: str,
    cycle_days: list[int],
    today: date | None = None,
) -> tuple[date, date]:
    """Return the ``(start, end)`` window to query satellite data for."""
    today = today or date.today()
    canonical = normalize_stage(stage)
    fraction = STAGE_FRACTIONS.get(canonical, 1.0)

    max_cycle = max(int(day) for day in cycle_days)
    estimated_end = sowing_date + timedelta(days=round(fraction * max_cycle))

    end = max(min(today, estimated_end), sowing_date)
    return sowing_date, end


def trapezoid_score(value: float, thresholds: list[float]) -> float:
    """Score ``value`` against a trapezoid ``[a, b, c, d]`` in ``[0, 1]``."""
    if len(thresholds) != 4:
        raise ValueError(f"Trapezoid must have exactly four thresholds: {thresholds}")

    a, b, c, d = (float(limit) for limit in thresholds)
    if value < a or value > d:
        return 0.0
    if value < b:
        return (value - a) / (b - a) if b != a else 1.0
    if value <= c:
        return 1.0
    return (d - value) / (d - c) if d != c else 1.0


def classify_agronomic(score: float) -> str:
    """Human-readable label for the aggregated agronomic score."""
    if score >= 0.80:
        return "optimo"
    if score >= 0.60:
        return "adecuado"
    if score >= 0.40:
        return "marginal"
    return "inadecuado"
