"""Contract test for the bundled example parcel file."""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from agrovia_api.config import DEFAULT_PARCEL_EXAMPLE
from agrovia_api.main import load_parcela_from_file
from agrovia_api.schemas import ParcelaInput


def test_example_file_matches_contract() -> None:
    assert DEFAULT_PARCEL_EXAMPLE.exists(), "example parcel file is missing"
    parcela = load_parcela_from_file(DEFAULT_PARCEL_EXAMPLE)

    assert parcela.latitud == 24.4442
    assert parcela.longitud == -104.1217
    assert parcela.superficie_hectareas == 12.5
    assert parcela.tipo_terreno == "plano"
    assert parcela.tipo_suelo == "franco"
    assert parcela.disponibilidad_agua == "limitada"
    assert parcela.sistema_riego == "temporal"
    assert parcela.cultivo_actual == "maiz_grano"
    assert parcela.fecha_siembra == date(2026, 6, 15)
    assert parcela.etapa_crecimiento == "cosecha"


def test_input_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        ParcelaInput.model_validate(
            {
                "latitud": 1.0,
                "longitud": 1.0,
                "superficie_hectareas": 1.0,
                "tipo_terreno": "plano",
                "tipo_suelo": "franco",
                "disponibilidad_agua": "limitada",
                "sistema_riego": "temporal",
                "cultivo_actual": "maiz_grano",
                "fecha_siembra": "2026-06-15",
                "etapa_crecimiento": "cosecha",
                "unexpected": True,
            }
        )
