"""ORNL DAAC MODIS NDVI client.

Uses the Terrestrial Ecology Subsetting & Visualization Services (TESViS)
RESTful web service (``https://modis.ornl.gov/rst/api/v1``). The MOD13Q1
250 m 16-day NDVI band is queried for the parcel coordinate, restricted to the
analysis window. NDVI is a supplementary signal here: the trained model does
not consume it, so a failure to reach ORNL DAAC degrades gracefully.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date, datetime
from statistics import fmean

import requests

from ..config import (
    ORNL_BASE_URL,
    ORNL_NDVI_BAND,
    ORNL_PRODUCT,
    ORNL_SUBSET_KM,
    ORNL_TIMEOUT_SECONDS,
)

MAX_DATES_PER_REQUEST = 10
MAX_ATTEMPTS = 2
FILL_THRESHOLD = -2000.0
DEFAULT_NDVI_SCALE = 0.0001


class OrnlMODISError(RuntimeError):
    """Raised when the ORNL DAAC MODIS web service cannot be queried."""


@dataclass(frozen=True)
class NDVIObservation:
    fecha: date
    ndvi: float


@dataclass(frozen=True)
class NDVISeries:
    """NDVI observations for a parcel, ordered by composite date."""

    observations: list[NDVIObservation]

    @property
    def values(self) -> list[float]:
        return [observation.ndvi for observation in self.observations]

    @property
    def count(self) -> int:
        return len(self.observations)

    @property
    def mean(self) -> float | None:
        return fmean(self.values) if self.values else None

    @property
    def maximum(self) -> float | None:
        return max(self.values) if self.values else None

    @property
    def minimum(self) -> float | None:
        return min(self.values) if self.values else None

    @property
    def latest(self) -> float | None:
        return self.observations[-1].ndvi if self.observations else None


class OrnlMODISClient:
    """Thin wrapper around the MODIS/VIIRS Land Products web service."""

    def __init__(
        self,
        base_url: str = ORNL_BASE_URL,
        product: str = ORNL_PRODUCT,
        band: str = ORNL_NDVI_BAND,
        subset_km: int = ORNL_SUBSET_KM,
        timeout: float = ORNL_TIMEOUT_SECONDS,
        session: requests.Session | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._product = product
        self._band = band
        self._subset_km = subset_km
        self._timeout = timeout
        self._session = session

    @property
    def product(self) -> str:
        return self._product

    @property
    def band(self) -> str:
        return self._band

    def _get_session(self) -> requests.Session:
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(
                {"User-Agent": "AgroVia/1.0 (Durango agriculture)"}
            )
        return self._session

    def _request(self, path: str, params: dict[str, object]) -> dict:
        session = self._get_session()
        headers = {"Accept": "application/json"}
        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = session.get(
                    f"{self._base_url}/{path}",
                    params=params,
                    headers=headers,
                    timeout=self._timeout,
                )
                response.raise_for_status()
                return response.json()
            except (requests.RequestException, ValueError) as exc:
                last_error = exc
                if attempt < MAX_ATTEMPTS:
                    time.sleep(2 * attempt)
        raise OrnlMODISError(f"ORNL DAAC request failed: {last_error}") from last_error

    def _available_dates(
        self, latitude: float, longitude: float
    ) -> list[dict[str, object]]:
        payload = self._request(
            f"{self._product}/dates",
            {"latitude": latitude, "longitude": longitude},
        )
        raw_dates = payload.get("dates", [])
        parsed: list[dict[str, object]] = []
        for entry in raw_dates:
            if not isinstance(entry, dict):
                continue
            modis_date = entry.get("modis_date")
            calendar_date = _parse_calendar_date(entry.get("calendar_date"), modis_date)
            if modis_date is None or calendar_date is None:
                continue
            parsed.append({"modis_date": modis_date, "calendar_date": calendar_date})
        return parsed

    def _subset(
        self,
        latitude: float,
        longitude: float,
        chunk: list[dict[str, object]],
    ) -> list[NDVIObservation]:
        payload = self._request(
            f"{self._product}/subset",
            {
                "latitude": latitude,
                "longitude": longitude,
                "startDate": chunk[0]["modis_date"],
                "endDate": chunk[-1]["modis_date"],
                "kmAboveBelow": self._subset_km,
                "kmLeftRight": self._subset_km,
            },
        )
        observations: list[NDVIObservation] = []
        for entry in payload.get("subset", []):
            observation = self._parse_observation(entry)
            if observation is not None:
                observations.append(observation)
        return observations

    def _parse_observation(self, entry: object) -> NDVIObservation | None:
        if not isinstance(entry, dict):
            return None
        if entry.get("band") not in (None, self._band):
            return None

        pixel = entry.get("pixel") or entry.get("data")
        if not isinstance(pixel, list) or not pixel:
            return None
        center_row = pixel[len(pixel) // 2]
        if not isinstance(center_row, list) or not center_row:
            return None
        try:
            raw_value = float(center_row[len(center_row) // 2])
        except (TypeError, ValueError):
            return None
        if raw_value <= FILL_THRESHOLD:
            return None

        scale = entry.get("scale")
        try:
            scale_value = float(scale) if scale is not None else DEFAULT_NDVI_SCALE
        except (TypeError, ValueError):
            scale_value = DEFAULT_NDVI_SCALE

        calendar_date = _parse_calendar_date(
            entry.get("calendar_date"), entry.get("modis_date")
        )
        if calendar_date is None:
            return None

        return NDVIObservation(
            fecha=calendar_date, ndvi=round(raw_value * scale_value, 4)
        )

    def fetch_ndvi(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
    ) -> NDVISeries:
        """Return the NDVI composites that fall within ``[start, end]``."""
        available = self._available_dates(latitude, longitude)
        selected = [
            entry
            for entry in available
            if isinstance(entry["calendar_date"], date)
            and start <= entry["calendar_date"] <= end
        ]
        if not selected:
            return NDVISeries(observations=[])

        observations: list[NDVIObservation] = []
        for index in range(0, len(selected), MAX_DATES_PER_REQUEST):
            chunk = selected[index : index + MAX_DATES_PER_REQUEST]
            observations.extend(self._subset(latitude, longitude, chunk))

        observations.sort(key=lambda observation: observation.fecha)
        return NDVISeries(observations=observations)


def _parse_calendar_date(
    calendar_date: object, modis_date: object
) -> date | None:
    if isinstance(calendar_date, str):
        try:
            return datetime.strptime(calendar_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    if isinstance(modis_date, str) and len(modis_date) == 8 and modis_date[0] == "A":
        try:
            return datetime.strptime(modis_date[1:], "%Y%j").date()
        except ValueError:
            return None
    return None
