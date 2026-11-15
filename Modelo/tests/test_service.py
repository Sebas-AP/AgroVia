"""Tests for the AgroVia evaluation service orchestration."""

from __future__ import annotations

from datetime import date

import pytest

from agrovia_api.catalogs import load_crops, load_municipalities
from agrovia_api.clients.ornl_modis import NDVIObservation, NDVISeries
from agrovia_api.errors import (
    InvalidCropError,
    InvalidModalityError,
    InvalidParcelError,
)
from agrovia_api.schemas import ParcelaInput
from agrovia_api.service import AgroViaService
from tests.fakes import FakeClimateClient, FakeModelRunner, FakeNDVIClient

PARCELA = {
    "latitud": 24.4442,
    "longitud": -104.1217,
    "superficie_hectareas": 12.5,
    "tipo_terreno": "plano",
    "tipo_suelo": "franco",
    "disponibilidad_agua": "limitada",
    "sistema_riego": "temporal",
    "cultivo_actual": "maiz_grano",
    "fecha_siembra": "2026-06-15",
    "etapa_crecimiento": "cosecha",
}


def build_service(
    ndvi_client: FakeNDVIClient | None = None,
    model: FakeModelRunner | None = None,
) -> tuple[AgroViaService, FakeClimateClient, FakeModelRunner]:
    climate = FakeClimateClient()
    runner = model or FakeModelRunner()
    service = AgroViaService(
        climate_client=climate,
        ndvi_client=ndvi_client or FakeNDVIClient(),
        model_runner=runner,
        crops=load_crops(),
        municipalities=load_municipalities(),
        today=date(2026, 11, 14),
    )
    return service, climate, runner


def test_evaluate_builds_full_response() -> None:
    service, climate, runner = build_service(
        ndvi_client=FakeNDVIClient(
            series=NDVISeries(
                observations=[
                    NDVIObservation(date(2026, 7, 1), 0.42),
                    NDVIObservation(date(2026, 7, 17), 0.55),
                ]
            )
        )
    )
    result = service.evaluate(ParcelaInput.model_validate(PARCELA))

    assert result.municipio.cve_mun == 8
    assert result.municipio.municipio == "Guadalupe Victoria"
    assert result.cultivo.cultivo_id == "maiz_grano"
    assert result.ventana_analisis.etapa_crecimiento == "cosecha"
    assert result.ventana_analisis.fin == date(2026, 10, 28)
    assert result.clima.lluvia_ciclo_mm == 480.0
    assert result.evaluacion_modelo.probabilidad_exito == 0.8
    assert result.evaluacion_modelo.clasificacion == "alto"
    assert result.ndvi is not None
    assert result.ndvi.n_observaciones == 2
    assert result.ndvi.ndvi_ultimo == 0.55

    assert climate.calls[0]["start"] == date(2026, 6, 15)
    assert runner.last_features is not None
    assert runner.last_features["cultivo_id"] == "maiz_grano"
    assert runner.last_features["modalidad"] == "temporal"
    assert runner.last_features["cve_mun"] == 8


def test_evaluate_scores_four_trapezoids() -> None:
    service, _, _ = build_service()
    result = service.evaluate(ParcelaInput.model_validate(PARCELA))

    variables = {score.variable for score in result.evaluacion_agronomica.puntajes}
    assert variables == {
        "lluvia_mm",
        "temp_media_c",
        "temp_min_ciclo_c",
        "radiacion_mj_m2",
    }
    assert 0.0 <= result.evaluacion_agronomica.puntaje_global <= 1.0


def test_evaluate_degrades_when_ndvi_fails() -> None:
    service, _, _ = build_service(
        ndvi_client=FakeNDVIClient(error=RuntimeError("ORNL offline"))
    )
    result = service.evaluate(ParcelaInput.model_validate(PARCELA))

    assert result.ndvi is None
    assert any("NDVI" in warning for warning in result.advertencias)


def test_evaluate_maps_irrigation_synonym() -> None:
    service, _, runner = build_service()
    parcela = dict(PARCELA, sistema_riego="goteo")
    service.evaluate(ParcelaInput.model_validate(parcela))
    assert runner.last_features is not None
    assert runner.last_features["modalidad"] == "riego"


def test_evaluate_rejects_unknown_crop() -> None:
    service, _, _ = build_service()
    parcela = dict(PARCELA, cultivo_actual="quinoa")
    with pytest.raises(InvalidCropError):
        service.evaluate(ParcelaInput.model_validate(parcela))


def test_evaluate_rejects_unknown_modality() -> None:
    service, _, _ = build_service()
    parcela = dict(PARCELA, sistema_riego="hidroponia")
    with pytest.raises(InvalidModalityError):
        service.evaluate(ParcelaInput.model_validate(parcela))


def test_evaluate_rejects_future_sowing() -> None:
    service, _, _ = build_service()
    parcela = dict(PARCELA, fecha_siembra="2027-01-01")
    with pytest.raises(InvalidParcelError):
        service.evaluate(ParcelaInput.model_validate(parcela))
