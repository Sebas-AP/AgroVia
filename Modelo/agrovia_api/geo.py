"""Geospatial helpers: resolve a coordinate to the nearest municipality."""

from __future__ import annotations

import math
from typing import Any

EARTH_RADIUS_KM = 6371.0088


def haversine_km(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    """Great-circle distance between two WGS84 points, in kilometres."""
    phi_a = math.radians(latitude_a)
    phi_b = math.radians(latitude_b)
    delta_phi = math.radians(latitude_b - latitude_a)
    delta_lambda = math.radians(longitude_b - longitude_a)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2.0) ** 2
    )
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def nearest_municipality(
    latitude: float,
    longitude: float,
    municipalities: list[dict[str, Any]],
) -> tuple[dict[str, Any], float]:
    """Return the closest municipality record and the distance to it (km)."""
    if not municipalities:
        raise ValueError("Municipality catalogue is empty")

    best: dict[str, Any] | None = None
    best_distance = math.inf
    for municipality in municipalities:
        distance = haversine_km(
            latitude,
            longitude,
            float(municipality["lat"]),
            float(municipality["lon"]),
        )
        if distance < best_distance:
            best = municipality
            best_distance = distance

    assert best is not None  # nosec - guarded by the empty check above
    return best, best_distance
