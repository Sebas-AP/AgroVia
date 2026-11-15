"""Tests for the AgroVia evaluation service orchestration."""

from __future__ import annotations

import time
from datetime import date

import pytest

from agrovia_api.cache import TTLCache
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


def test_evaluate_caches_climate_for_the_same_coordinate_and_window() -> None:
    service, climate, _ = build_service()
    service.evaluate(ParcelaInput.model_validate(PARCELA))
    service.evaluate(ParcelaInput.model_validate(PARCELA))
    assert len(climate.calls) == 1


def test_evaluate_falls_back_to_cached_climate_when_nasa_power_fails() -> None:
    # A near-zero TTL means the cache entry has already gone stale by the second call, so this
    # actually exercises the fetch-fails-but-stale-value-exists path, not a fresh cache hit.
    climate = FakeClimateClient()
    service = AgroViaService(
        climate_client=climate, ndvi_client=FakeNDVIClient(), model_runner=FakeModelRunner(),
        crops=load_crops(), municipalities=load_municipalities(), today=date(2026, 11, 14),
        climate_cache=TTLCache(ttl_seconds=0.01),
    )
    result = service.evaluate(ParcelaInput.model_validate(PARCELA))
    first_rain = result.clima.lluvia_ciclo_mm

    time.sleep(0.02)
    climate.error = RuntimeError("NASA POWER unavailable")
    result_during_outage = service.evaluate(ParcelaInput.model_validate(PARCELA))

    assert result_during_outage.clima.lluvia_ciclo_mm == first_rain
    assert any("NASA POWER" in warning for warning in result_during_outage.advertencias)


def test_evaluate_raises_when_climate_fails_with_nothing_cached() -> None:
    service, climate, _ = build_service()
    climate.error = RuntimeError("NASA POWER unavailable")
    with pytest.raises(RuntimeError):
        service.evaluate(ParcelaInput.model_validate(PARCELA))


def test_fetch_daily_climate_window_returns_the_real_per_day_values_unaggregated() -> None:
    service, _, _ = build_service()
    result = service.fetch_daily_climate_window(
        24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16),
    )
    assert [p.fecha for p in result.serie] == [date(2026, 6, 15), date(2026, 6, 16)]
    assert result.serie[0].valores["RH2M"] == 41.0
    # Day two's fake data has no RH2M — never filled in, just absent.
    assert "RH2M" not in result.serie[1].valores
    assert "RH2M" in result.parametros  # present overall, since at least one day had it


def test_fetch_daily_climate_window_is_cached_and_independent_of_the_aggregate_cache() -> None:
    service, climate, _ = build_service()
    service.fetch_daily_climate_window(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))
    service.fetch_daily_climate_window(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))
    assert len(climate.daily_calls) == 1
    assert len(climate.calls) == 0  # fetch_cycle (the aggregate path) was never touched


def test_fetch_daily_climate_window_falls_back_to_cached_series_when_nasa_power_fails() -> None:
    climate = FakeClimateClient()
    service = AgroViaService(
        climate_client=climate, ndvi_client=FakeNDVIClient(), model_runner=FakeModelRunner(),
        crops=load_crops(), municipalities=load_municipalities(), today=date(2026, 11, 14),
        daily_climate_cache=TTLCache(ttl_seconds=0.01),
    )
    first = service.fetch_daily_climate_window(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))

    time.sleep(0.02)
    climate.daily_error = RuntimeError("NASA POWER unavailable")
    during_outage = service.fetch_daily_climate_window(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))

    assert during_outage.serie == first.serie


def test_fetch_daily_climate_window_raises_when_nasa_power_fails_with_nothing_cached() -> None:
    service, climate, _ = build_service()
    climate.daily_error = RuntimeError("NASA POWER unavailable")
    with pytest.raises(RuntimeError):
        service.fetch_daily_climate_window(24.4442, -104.1217, date(2026, 6, 15), date(2026, 6, 16))


def test_evaluate_falls_back_to_cached_ndvi_when_ornl_fails_on_a_later_call() -> None:
    ndvi_client = FakeNDVIClient(
        series=NDVISeries(observations=[NDVIObservation(date(2026, 7, 1), 0.42)])
    )
    service = AgroViaService(
        climate_client=FakeClimateClient(), ndvi_client=ndvi_client, model_runner=FakeModelRunner(),
        crops=load_crops(), municipalities=load_municipalities(), today=date(2026, 11, 14),
        ndvi_cache=TTLCache(ttl_seconds=0.01),
    )
    first = service.evaluate(ParcelaInput.model_validate(PARCELA))
    assert first.ndvi is not None

    time.sleep(0.02)
    ndvi_client.error = RuntimeError("ORNL DAAC unavailable")
    second = service.evaluate(ParcelaInput.model_validate(PARCELA))

    assert second.ndvi is not None
    assert second.ndvi.ndvi_ultimo == first.ndvi.ndvi_ultimo
    assert any("NDVI" in warning and "caché" in warning for warning in second.advertencias)
