"""Test doubles for the AgroVia API test-suite (offline, no live calls)."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import requests

from agrovia_api.clients.nasa_power import ClimateAggregate, ClimateDailyPoint
from agrovia_api.clients.ornl_modis import NDVISeries


class FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self) -> Any:
        return self._payload


class FakeSession:
    """Minimal ``requests.Session`` stand-in driven by a responder callable."""

    def __init__(self, responder) -> None:
        self._responder = responder
        self.calls: list[dict[str, Any]] = []

    def get(self, url, params=None, headers=None, timeout=None) -> FakeResponse:
        self.calls.append(
            {"url": url, "params": params, "headers": headers, "timeout": timeout}
        )
        return self._responder(url, params or {})


class FakeClimateClient:
    def __init__(
        self,
        aggregate: ClimateAggregate | None = None,
        error: Exception | None = None,
        daily_series: list[ClimateDailyPoint] | None = None,
        daily_error: Exception | None = None,
    ) -> None:
        self.aggregate = aggregate or ClimateAggregate(
            lluvia_ciclo_mm=480.0,
            temp_media_c=20.5,
            temp_max_c=27.0,
            temp_min_extrema_c=8.0,
            radiacion_mj_m2=20.0,
            n_dias=120,
        )
        self.error = error
        self.daily_series = daily_series if daily_series is not None else [
            ClimateDailyPoint(fecha=date(2026, 6, 15), valores={"PRECTOTCORR": 2.0, "T2M": 20.0, "RH2M": 41.0}),
            ClimateDailyPoint(fecha=date(2026, 6, 16), valores={"PRECTOTCORR": 0.0, "T2M": 21.0}),
        ]
        self.daily_error = daily_error
        self.calls: list[dict[str, Any]] = []
        self.daily_calls: list[dict[str, Any]] = []

    def fetch_cycle(self, latitude, longitude, start: date, end: date):
        self.calls.append(
            {"latitude": latitude, "longitude": longitude, "start": start, "end": end}
        )
        if self.error is not None:
            raise self.error
        return self.aggregate

    def fetch_daily_series(self, latitude, longitude, start: date, end: date):
        self.daily_calls.append(
            {"latitude": latitude, "longitude": longitude, "start": start, "end": end}
        )
        if self.daily_error is not None:
            raise self.daily_error
        return self.daily_series


class FakeNDVIClient:
    def __init__(
        self,
        series: NDVISeries | None = None,
        error: Exception | None = None,
    ) -> None:
        self.series = series or NDVISeries(observations=[])
        self.error = error
        self.product = "MOD13Q1"
        self.band = "250m_16_days_NDVI"
        self.calls: list[dict[str, Any]] = []

    def fetch_ndvi(self, latitude, longitude, start: date, end: date) -> NDVISeries:
        self.calls.append(
            {"latitude": latitude, "longitude": longitude, "start": start, "end": end}
        )
        if self.error is not None:
            raise self.error
        return self.series


class FakeModelRunner:
    def __init__(self, probability: float = 0.8, predicted_class: int = 1) -> None:
        self.probability = probability
        self.predicted_class = predicted_class
        self._path = Path("modelo_agrovia.joblib")
        self.last_features: dict[str, Any] | None = None

    @property
    def model_path(self) -> Path:
        return self._path

    def predict(self, features: dict[str, Any]) -> tuple[float, int]:
        self.last_features = dict(features)
        return self.probability, self.predicted_class
