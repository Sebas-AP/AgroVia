"""Tests for the ORNL DAAC MODIS NDVI client."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from agrovia_api.clients.ornl_modis import OrnlMODISClient, OrnlMODISError
from tests.fakes import FakeResponse, FakeSession

BAND = "250m_16_days_NDVI"
START_MODISOY = date(2026, 1, 1)


def _modis_date(day_index: int) -> str:
    return "A" + (START_MODISOY + timedelta(days=day_index)).strftime("%Y%j")


def _dates_payload(count: int) -> dict:
    return {
        "dates": [
            {
                "modis_date": _modis_date(index),
                "calendar_date": (START_MODISOY + timedelta(days=index)).isoformat(),
            }
            for index in range(count)
        ]
    }


def _center_pixel(raw_value: int) -> list[list[int]]:
    return [[0, 0, 0], [0, raw_value, 0], [0, 0, 0]]


def _make_session(dates_payload: dict, centers: dict[str, int]) -> FakeSession:
    def responder(url: str, params: dict) -> FakeResponse:
        if url.endswith("/dates"):
            return FakeResponse(dates_payload)
        start = params["startDate"]
        end = params["endDate"]
        subset = [
            {
                "band": BAND,
                "modis_date": modis_date,
                "calendar_date": None,
                "pixel": _center_pixel(raw_value),
                "scale": "0.0001",
            }
            for modis_date, raw_value in centers.items()
            if start <= modis_date <= end
        ]
        return FakeResponse({"subset": subset})

    return FakeSession(responder)


def test_fetch_ndvi_orders_and_summarizes() -> None:
    dates = _dates_payload(3)
    centers = {
        dates["dates"][0]["modis_date"]: 2000,
        dates["dates"][1]["modis_date"]: 6000,
        dates["dates"][2]["modis_date"]: 4000,
    }
    client = OrnlMODISClient(session=_make_session(dates, centers))

    series = client.fetch_ndvi(
        24.4442, -104.1217, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert series.count == 3
    assert series.values == [0.2, 0.6, 0.4]
    assert series.mean == pytest.approx(0.4)
    assert series.latest == 0.4
    assert series.maximum == 0.6
    assert series.minimum == 0.2


def test_fetch_ndvi_skips_fill_values() -> None:
    dates = _dates_payload(2)
    centers = {
        dates["dates"][0]["modis_date"]: -3000,
        dates["dates"][1]["modis_date"]: 5000,
    }
    client = OrnlMODISClient(session=_make_session(dates, centers))

    series = client.fetch_ndvi(
        24.4442, -104.1217, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert series.count == 1
    assert series.values == [0.5]


def test_fetch_ndvi_chunks_requests() -> None:
    dates = _dates_payload(12)
    centers = {entry["modis_date"]: 4000 for entry in dates["dates"]}
    session = _make_session(dates, centers)
    client = OrnlMODISClient(session=session)

    series = client.fetch_ndvi(
        24.4442, -104.1217, date(2026, 1, 1), date(2026, 3, 1)
    )

    subset_calls = [call for call in session.calls if call["url"].endswith("/subset")]
    assert len(subset_calls) == 2
    assert series.count == 12


def test_fetch_ndvi_empty_window() -> None:
    dates = _dates_payload(2)
    client = OrnlMODISClient(session=_make_session(dates, {}))

    series = client.fetch_ndvi(
        24.4442, -104.1217, date(2025, 1, 1), date(2025, 1, 31)
    )
    assert series.count == 0
    assert series.mean is None


def test_fetch_ndvi_http_error_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("agrovia_api.clients.ornl_modis.time.sleep", lambda *_: None)
    session = FakeSession(lambda url, params: FakeResponse({}, status_code=500))
    client = OrnlMODISClient(session=session)

    with pytest.raises(OrnlMODISError):
        client.fetch_ndvi(
            24.4442, -104.1217, date(2026, 1, 1), date(2026, 1, 31)
        )
