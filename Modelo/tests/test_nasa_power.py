"""Tests for the NASA POWER client aggregation."""

from __future__ import annotations

from datetime import date

import pytest

from agrovia_api.clients.nasa_power import PARAMETERS, NasaPowerClient, NasaPowerError
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


def test_fetch_cycle_still_requests_exactly_the_original_five_parameters() -> None:
    # Regression guard: DAILY_SERIES_PARAMETERS must never leak into fetch_cycle's request —
    # the model was trained against exactly these 5 features.
    assert PARAMETERS == ("PRECTOTCORR", "T2M", "T2M_MIN", "T2M_MAX", "ALLSKY_SFC_SW_DWN")
    client, session = _client(FULL_PAYLOAD)
    client.fetch_cycle(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 17))
    assert set(session.calls[0]["params"]["parameters"].split(",")) == set(PARAMETERS)


DAILY_SERIES_PAYLOAD = {
    "properties": {
        "parameter": {
            "PRECTOTCORR": {"20260615": 10.0, "20260616": 5.0},
            "T2M": {"20260615": 20.0, "20260616": 22.0},
            "T2M_MIN": {"20260615": 8.0, "20260616": 6.0},
            "T2M_MAX": {"20260615": 28.0, "20260616": 30.0},
            "ALLSKY_SFC_SW_DWN": {"20260615": 20.0, "20260616": 22.0},
            "RH2M": {"20260615": 41.0, "20260616": -999.0},
            "GWETTOP": {"20260615": 0.27, "20260616": 0.25},
            "GWETROOT": {"20260615": 0.34, "20260616": 0.34},
            "GWETPROF": {"20260615": 0.35, "20260616": 0.35},
            "TS": {"20260615": 27.0, "20260616": 28.0},
        }
    },
    "header": {"fill_value": -999.0},
}


def test_fetch_daily_series_returns_one_point_per_real_day_unaggregated() -> None:
    client, session = _client(DAILY_SERIES_PAYLOAD)
    points = client.fetch_daily_series(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))

    assert [p.fecha for p in points] == [date(2026, 6, 15), date(2026, 6, 16)]
    assert points[0].valores["RH2M"] == 41.0
    assert points[0].valores["PRECTOTCORR"] == 10.0

    requested = set(session.calls[0]["params"]["parameters"].split(","))
    assert requested == {"PRECTOTCORR", "T2M", "T2M_MIN", "T2M_MAX", "ALLSKY_SFC_SW_DWN", "RH2M", "GWETTOP", "GWETROOT", "GWETPROF", "TS"}


def test_fetch_daily_series_omits_a_fill_value_rather_than_filling_it_in() -> None:
    client, _ = _client(DAILY_SERIES_PAYLOAD)
    points = client.fetch_daily_series(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))

    day_two = next(p for p in points if p.fecha == date(2026, 6, 16))
    assert "RH2M" not in day_two.valores
    assert day_two.valores["T2M"] == 22.0


def test_fetch_daily_series_raises_when_nothing_is_usable() -> None:
    payload = {
        "properties": {"parameter": {"PRECTOTCORR": {"20260615": -999.0}}},
        "header": {"fill_value": -999.0},
    }
    client, _ = _client(payload)
    with pytest.raises(NasaPowerError):
        client.fetch_daily_series(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 15))
