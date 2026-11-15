"""Tests for trapezoidal scoring and phenological windows."""

from __future__ import annotations

from datetime import date

import pytest

from agrovia_api.agronomy import (
    analysis_window,
    classify_agronomic,
    normalize_stage,
    trapezoid_score,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (99.0, 0.0),  # below a
        (100.0, 0.0),  # at a
        (150.0, 0.5),  # mid ramp
        (200.0, 1.0),  # start of plateau
        (300.0, 1.0),  # end of plateau
        (350.0, 0.5),  # mid decline
        (400.0, 0.0),  # at d
        (401.0, 0.0),  # above d
    ],
)
def test_trapezoid_score(value: float, expected: float) -> None:
    assert trapezoid_score(value, [100, 200, 300, 400]) == pytest.approx(expected)


def test_trapezoid_score_requires_four_thresholds() -> None:
    with pytest.raises(ValueError):
        trapezoid_score(10.0, [1, 2, 3])


def test_trapezoid_score_handles_degenerate_plateau() -> None:
    assert trapezoid_score(200.0, [100, 200, 200, 300]) == 1.0


def test_normalize_stage_synonyms() -> None:
    assert normalize_stage("Llenado de Grano") == "fructificacion"
    assert normalize_stage("Cosecha") == "cosecha"
    assert normalize_stage("floracion") == "floracion"
    assert normalize_stage("something-unknown") == "desconocida"


def test_analysis_window_cosecha_uses_full_cycle() -> None:
    start, end = analysis_window(
        date(2026, 6, 15), "cosecha", [110, 135], today=date(2026, 11, 14)
    )
    assert start == date(2026, 6, 15)
    assert end == date(2026, 10, 28)


def test_analysis_window_vegetativo_is_shorter() -> None:
    _, end = analysis_window(
        date(2026, 6, 15), "vegetativo", [110, 135], today=date(2026, 11, 14)
    )
    assert end == date(2026, 8, 8)


def test_analysis_window_never_exceeds_today() -> None:
    _, end = analysis_window(
        date(2026, 6, 15), "cosecha", [110, 135], today=date(2026, 7, 1)
    )
    assert end == date(2026, 7, 1)


def test_classify_agronomic() -> None:
    assert classify_agronomic(0.9) == "optimo"
    assert classify_agronomic(0.65) == "adecuado"
    assert classify_agronomic(0.5) == "marginal"
    assert classify_agronomic(0.1) == "inadecuado"
