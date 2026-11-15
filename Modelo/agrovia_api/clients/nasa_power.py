"""NASA POWER daily-point client.

Mirrors the aggregation used to build the training dataset in
``fetch_historical_nasa.py``: precipitation is summed, air temperature and
solar radiation are averaged, and the cycle's extreme minimum temperature is
taken from the daily minima. Values are passed through as received; the only
transformation is masking the documented ``-999`` fill value.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date, datetime
from statistics import fmean

import requests

from ..config import HTTP_TIMEOUT_SECONDS, NASA_POWER_URL

PARAMETERS = ("PRECTOTCORR", "T2M", "T2M_MIN", "T2M_MAX", "ALLSKY_SFC_SW_DWN")
# Separate from PARAMETERS on purpose: fetch_cycle's request/aggregate must stay byte-for-byte
# the same (the model was trained against exactly those 5 features). These are the extra
# parameters the Backend's indicators engine needs — soil moisture and air humidity, which
# PARAMETERS never requested, so they could never be real anywhere in the system. Verified
# populated for Guadalupe Victoria (24.4497, -104.1225) via a live call before adding them.
DAILY_SERIES_EXTRA_PARAMETERS = ("RH2M", "GWETTOP", "GWETROOT", "GWETPROF", "TS")
DAILY_SERIES_PARAMETERS = PARAMETERS + DAILY_SERIES_EXTRA_PARAMETERS
FILL_SENTINEL = -900.0
MAX_ATTEMPTS = 3


class NasaPowerError(RuntimeError):
    """Raised when NASA POWER data cannot be retrieved or aggregated."""


@dataclass(frozen=True)
class ClimateAggregate:
    """Cycle-level climate features consumed by the trained model."""

    lluvia_ciclo_mm: float
    temp_media_c: float
    temp_max_c: float
    temp_min_extrema_c: float
    radiacion_mj_m2: float
    n_dias: int


@dataclass(frozen=True)
class ClimateDailyPoint:
    """One real day of NASA POWER values, exactly as received (fill values masked, nothing
    interpolated). `valores` only has the keys that actually had a usable value that day — a
    parameter missing for a given day is simply absent, never filled in."""

    fecha: date
    valores: dict[str, float]


class NasaPowerClient:
    """Thin wrapper around the NASA POWER daily point API."""

    def __init__(
        self,
        base_url: str = NASA_POWER_URL,
        timeout: float = HTTP_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self._base_url = base_url
        self._timeout = timeout
        self._session = session

    def _get_session(self) -> requests.Session:
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(
                {"User-Agent": "AgroVia/1.0 (Durango agriculture)"}
            )
        return self._session

    def _request(self, params: dict[str, object]) -> dict:
        session = self._get_session()
        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = session.get(
                    self._base_url, params=params, timeout=self._timeout
                )
                response.raise_for_status()
                return response.json()
            except (requests.RequestException, ValueError) as exc:
                last_error = exc
                if attempt < MAX_ATTEMPTS:
                    time.sleep(2 * attempt)
        raise NasaPowerError(f"NASA POWER request failed: {last_error}") from last_error

    def fetch_cycle(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
    ) -> ClimateAggregate:
        """Download and aggregate daily values for ``[start, end]`` inclusive."""
        params = {
            "parameters": ",".join(PARAMETERS),
            "community": "AG",
            "latitude": latitude,
            "longitude": longitude,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        }
        payload = self._request(params)

        try:
            parameter_data = payload["properties"]["parameter"]
        except (KeyError, TypeError) as exc:
            raise NasaPowerError(
                "NASA POWER response is missing the parameter payload"
            ) from exc

        fill = float(payload.get("header", {}).get("fill_value", -999.0))
        cleaned = {
            parameter: _clean_series(parameter_data.get(parameter, {}), fill)
            for parameter in PARAMETERS
        }

        precipitation = cleaned["PRECTOTCORR"]
        temperatures = cleaned["T2M"]
        maxima = cleaned["T2M_MAX"]
        minima = cleaned["T2M_MIN"]
        radiation = cleaned["ALLSKY_SFC_SW_DWN"]

        if not (precipitation and temperatures and maxima and minima and radiation):
            raise NasaPowerError(
                "NASA POWER returned no usable daily records for the window"
            )

        return ClimateAggregate(
            lluvia_ciclo_mm=round(sum(precipitation), 2),
            temp_media_c=round(fmean(temperatures), 2),
            temp_max_c=round(fmean(maxima), 2),
            temp_min_extrema_c=round(min(minima), 2),
            radiacion_mj_m2=round(fmean(radiation), 2),
            n_dias=len(temperatures),
        )

    def fetch_daily_series(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
    ) -> list[ClimateDailyPoint]:
        """Download the raw daily series for ``[start, end]`` inclusive — the per-day values
        fetch_cycle already downloads and then discards after aggregating, exposed as-is for
        anything that needs real daily granularity (the Backend's indicators engine)."""
        params = {
            "parameters": ",".join(DAILY_SERIES_PARAMETERS),
            "community": "AG",
            "latitude": latitude,
            "longitude": longitude,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        }
        payload = self._request(params)

        try:
            parameter_data = payload["properties"]["parameter"]
        except (KeyError, TypeError) as exc:
            raise NasaPowerError(
                "NASA POWER response is missing the parameter payload"
            ) from exc

        fill = float(payload.get("header", {}).get("fill_value", -999.0))
        by_date: dict[str, dict[str, float]] = {}
        for parameter in DAILY_SERIES_PARAMETERS:
            raw_series = parameter_data.get(parameter, {})
            if not isinstance(raw_series, dict):
                continue
            for raw_date, raw_value in raw_series.items():
                try:
                    number = float(raw_value)
                except (TypeError, ValueError):
                    continue
                if number <= FILL_SENTINEL or number == fill:
                    continue
                by_date.setdefault(raw_date, {})[parameter] = number

        if not by_date:
            raise NasaPowerError("NASA POWER returned no usable daily records for the window")

        return [
            ClimateDailyPoint(fecha=datetime.strptime(raw_date, "%Y%m%d").date(), valores=valores)
            for raw_date, valores in sorted(by_date.items())
        ]


def _clean_series(raw_series: object, fill: float) -> list[float]:
    """Return the finite, non-fill values of a ``{YYYYMMDD: value}`` mapping."""
    if not isinstance(raw_series, dict):
        return []
    values: list[float] = []
    for raw_value in raw_series.values():
        try:
            number = float(raw_value)
        except (TypeError, ValueError):
            continue
        if number <= FILL_SENTINEL or number == fill:
            continue
        values.append(number)
    return values
