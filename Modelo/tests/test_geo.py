"""Tests for the geospatial municipality resolution."""

from __future__ import annotations

import pytest

from agrovia_api.geo import haversine_km, nearest_municipality


def test_haversine_known_distance() -> None:
    # Durango city to Gómez Palacio is roughly 240 km.
    distance = haversine_km(24.0277, -104.6532, 25.5698, -103.4959)
    assert distance == pytest.approx(212, abs=15)


def test_nearest_municipality_matches_guadalupe_victoria() -> None:
    municipalities = [
        {"cve_mun": 8, "municipio": "Guadalupe Victoria", "lat": 24.4442, "lon": -104.1217},
        {"cve_mun": 5, "municipio": "Durango", "lat": 24.0277, "lon": -104.6532},
    ]
    record, distance = nearest_municipality(24.4442, -104.1217, municipalities)
    assert record["cve_mun"] == 8
    assert distance == pytest.approx(0.0, abs=1e-6)


def test_nearest_municipality_requires_catalogue() -> None:
    with pytest.raises(ValueError):
        nearest_municipality(24.0, -104.0, [])
