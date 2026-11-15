"""Tests for the real SIAP price/yield dataset and its lookup."""

from __future__ import annotations

import json

from agrovia_api.config import PRICES_PATH
from agrovia_api.prices import load_price_dataset, lookup_prices


def test_dataset_is_generated_from_siap_and_keeps_tonne_rows_only() -> None:
    payload = json.loads(PRICES_PATH.read_text(encoding="utf-8"))
    assert payload["fuente"].startswith("SIAP")
    assert payload["registros"], "the committed dataset must not be empty"
    assert {row["unidad_fuente"] for row in payload["registros"]} == {"Tonelada"}
    assert all(row["anio"] >= 2016 for row in payload["registros"])


def test_lookup_returns_real_rows_for_guadalupe_victoria_corn() -> None:
    result = lookup_prices(load_price_dataset(), "maiz_grano", "Guadalupe Victoria")
    assert result.anio_ultimo is not None
    assert result.registros
    assert all(row.anio <= result.anio_ultimo for row in result.registros)
    # The two real 2024 rows have very different prices; both must be preserved as received.
    prices_2024 = [
        row.precio_mxn_t for row in result.registros if row.anio == 2024
    ]
    assert 1.88 in prices_2024
    assert 7097.78 in prices_2024


def test_lookup_never_substitutes_another_municipality() -> None:
    result = lookup_prices(load_price_dataset(), "maiz_grano", "Municipio inexistente")
    assert result.registros == []
    assert result.anio_ultimo is None
    assert "No SIAP record" in result.advertencias[0]


def test_lookup_can_narrow_to_one_year_and_reports_the_gap_when_absent() -> None:
    result = lookup_prices(load_price_dataset(), "maiz_grano", "Guadalupe Victoria", anio=1900)
    assert result.registros == []
    assert result.anio_ultimo is not None
    assert any("none for 1900" in warning for warning in result.advertencias)
