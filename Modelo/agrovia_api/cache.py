"""Tiny in-memory TTL cache for the climate/NDVI lookups.

Both are independent of which crop is being evaluated, so they're keyed by
(lat, lon, window start, window end) rather than by parcel — the composite
``/api/v1/evaluar-parcela`` route and the narrow ``/api/v1/clima`` /
``/api/v1/ndvi`` routes share the same cache instance (see
``service.build_default_service``), so calling the Backend once per candidate
crop for the same plot/window doesn't re-download from NASA POWER/ORNL DAAC
each time.
"""

from __future__ import annotations

import time
from collections.abc import Hashable
from threading import Lock
from typing import Generic, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    """Keeps the last value per key indefinitely, but tracks freshness separately.

    ``get`` only returns a value within its TTL. ``get_stale`` returns the last
    known value regardless of age, for falling back when a fresh fetch fails —
    real, previously-observed data, never a fabricated default.
    """

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._store: dict[Hashable, tuple[float, T]] = {}
        self._lock = Lock()

    def get(self, key: Hashable) -> T | None:
        with self._lock:
            entry = self._store.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        return value if expires_at > time.monotonic() else None

    def get_stale(self, key: Hashable) -> T | None:
        with self._lock:
            entry = self._store.get(key)
        return entry[1] if entry is not None else None

    def set(self, key: Hashable, value: T) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + self._ttl, value)
