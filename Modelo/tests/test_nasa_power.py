"""Tests for the NASA POWER client aggregation."""

from __future__ import annotations

from datetime import date

import pytest

from agrovia_api.clients.nasa_power import NasaPowerClient, NasaPowerError
from tests.fakes import FakeResponse, FakeSession

FULL_PAYLOAD = {
    "properties": {
        "parameter": {
            "PRECTOTCORR": {"20260615": 10.0, "20260616": 5.0, "20260617": -999.0},
            "T2M": {"20260615": 20.0, "20260616": 22.0, "20260617": 24.0},
            "T2M_MIN": {"20260615": 8.0, "20260616": 6.0, "20260617": 10.0},
            "T2M_MAX": {"20260615": 28.0, "20260616": 30.0, "20260617": 32.0},
            "ALLSKY_SFC_SW_DWN": {
                "20260615": 20.0,
                "20260616": 22.0,
                "20260617": 24.0,
            },
        }
    },
    "header": {"fill_value": -999.0},
}


def _client(payload: dict) -> tuple[NasaPowerClient, FakeSession]:
    session = FakeSession(lambda url, params: FakeResponse(payload))
    return NasaPowerClient(session=session), session


def test_fetch_cycle_aggregates_parameters() -> None:
    client, session = _client(FULL_PAYLOAD)
    aggregate = client.fetch_cycle(
        24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 17)
    )

    assert aggregate.lluvia_ciclo_mm == 15.0
    assert aggregate.temp_media_c == 22.0
    assert aggregate.temp_max_c == 30.0
    assert aggregate.temp_min_extrema_c == 6.0
    assert aggregate.radiacion_mj_m2 == 22.0
    assert aggregate.n_dias == 3

    params = session.calls[0]["params"]
    assert params["start"] == "20260615"
    assert params["end"] == "20260617"
    assert params["community"] == "AG"


def test_fetch_cycle_missing_payload_raises() -> None:
    client, _ = _client({"header": {}})
    with pytest.raises(NasaPowerError):
        client.fetch_cycle(
            24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 17)
        )


def test_fetch_cycle_all_fill_raises() -> None:
    payload = {
        "properties": {
            "parameter": {
                "PRECTOTCORR": {"20260615": -999.0},
                "T2M": {"20260615": -999.0},
                "T2M_MIN": {"20260615": -999.0},
                "T2M_MAX": {"20260615": -999.0},
                "ALLSKY_SFC_SW_DWN": {"20260615": -999.0},
            }
        },
        "header": {"fill_value": -999.0},
    }
    client, _ = _client(payload)
    with pytest.raises(NasaPowerError):
        client.fetch_cycle(
            24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 15)
        )
