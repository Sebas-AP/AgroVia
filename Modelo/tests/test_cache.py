"""Tests for the in-memory TTL cache used by climate/NDVI lookups."""

from __future__ import annotations

import time

from agrovia_api.cache import TTLCache


def test_get_returns_none_for_a_missing_key() -> None:
    cache: TTLCache[int] = TTLCache(ttl_seconds=60)
    assert cache.get("missing") is None


def test_get_returns_the_value_within_its_ttl() -> None:
    cache: TTLCache[int] = TTLCache(ttl_seconds=60)
    cache.set("key", 42)
    assert cache.get("key") == 42


def test_get_returns_none_once_the_ttl_has_elapsed() -> None:
    cache: TTLCache[int] = TTLCache(ttl_seconds=0.01)
    cache.set("key", 42)
    time.sleep(0.02)
    assert cache.get("key") is None


def test_get_stale_still_returns_the_value_after_the_ttl_has_elapsed() -> None:
    cache: TTLCache[int] = TTLCache(ttl_seconds=0.01)
    cache.set("key", 42)
    time.sleep(0.02)
    assert cache.get_stale("key") == 42


def test_get_stale_returns_none_when_nothing_was_ever_set() -> None:
    cache: TTLCache[int] = TTLCache(ttl_seconds=60)
    assert cache.get_stale("missing") is None


def test_set_overwrites_the_previous_value_and_resets_freshness() -> None:
    cache: TTLCache[int] = TTLCache(ttl_seconds=60)
    cache.set("key", 1)
    cache.set("key", 2)
    assert cache.get("key") == 2
