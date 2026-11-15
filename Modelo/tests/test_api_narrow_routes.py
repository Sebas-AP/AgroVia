"""Endpoint-level tests for the narrow /clima, /ndvi, /predecir, /municipio, /cultivos routes."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient

from agrovia_api.catalogs import load_crops, load_municipalities
from agrovia_api.clients.nasa_power import NasaPowerError
from agrovia_api.clients.ornl_modis import NDVIObservation, NDVISeries, OrnlMODISError
from agrovia_api.main import app, get_service
from agrovia_api.service import AgroViaService
from tests.fakes import FakeClimateClient, FakeModelRunner, FakeNDVIClient

VENTANA = {"latitud": 24.4442, "longitud": -104.1217, "inicio": "2026-06-15", "fin": "2026-10-28"}


@pytest.fixture
def service_and_fakes() -> tuple[AgroViaService, FakeClimateClient, FakeNDVIClient]:
    climate = FakeClimateClient()
    ndvi_client = FakeNDVIClient(
        series=NDVISeries(observations=[NDVIObservation(fecha=date(2026, 7, 1), ndvi=0.42)])
    )
    service = AgroViaService(
        climate_client=climate, ndvi_client=ndvi_client, model_runner=FakeModelRunner(),
        crops=load_crops(), municipalities=load_municipalities(), today=date(2026, 11, 14),
    )
    return service, climate, ndvi_client


@pytest.fixture
def client(service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient]) -> Iterator[TestClient]:
    service, _, _ = service_and_fakes
    app.dependency_overrides[get_service] = lambda: service
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_clima_returns_the_aggregate_for_the_window(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    response = client.post("/api/v1/clima", json=VENTANA)
    assert response.status_code == 200
    body = response.json()
    assert body["lluvia_ciclo_mm"] == 480.0
    assert body["ventana_inicio"] == VENTANA["inicio"]


def test_clima_rejects_an_invalid_latitude(client: TestClient) -> None:
    response = client.post("/api/v1/clima", json={**VENTANA, "latitud": 200.0})
    assert response.status_code == 422


def test_clima_maps_a_nasa_failure_with_nothing_cached_to_502(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    _, climate, _ = service_and_fakes
    climate.error = NasaPowerError("NASA POWER unavailable")
    response = client.post("/api/v1/clima", json=VENTANA)
    assert response.status_code == 502


def test_clima_reuses_the_cache_warmed_by_evaluar_parcela(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    from tests.test_service import PARCELA

    _, climate, _ = service_and_fakes
    # Same coordinate/window as VENTANA (PARCELA's cycle resolves to the same dates).
    client.post("/api/v1/evaluar-parcela", json=PARCELA)
    calls_after_composite = len(climate.calls)

    response = client.post("/api/v1/clima", json=VENTANA)
    assert response.status_code == 200
    assert len(climate.calls) == calls_after_composite


def test_clima_diario_returns_the_real_per_day_series(client: TestClient) -> None:
    response = client.post("/api/v1/clima/diario", json=VENTANA)
    assert response.status_code == 200
    body = response.json()
    assert body["serie"][0]["fecha"] == "2026-06-15"
    assert body["serie"][0]["valores"]["RH2M"] == 41.0
    assert "RH2M" not in body["serie"][1]["valores"]


def test_clima_diario_does_not_share_the_aggregate_endpoints_cache(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    _, climate, _ = service_and_fakes
    client.post("/api/v1/clima", json=VENTANA)
    response = client.post("/api/v1/clima/diario", json=VENTANA)
    assert response.status_code == 200
    assert len(climate.daily_calls) == 1  # its own request, not served from /clima's cache


def test_clima_diario_maps_a_nasa_failure_with_nothing_cached_to_502(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    _, climate, _ = service_and_fakes
    climate.daily_error = NasaPowerError("NASA POWER unavailable")
    response = client.post("/api/v1/clima/diario", json=VENTANA)
    assert response.status_code == 502


def test_ndvi_returns_the_series_for_the_window(client: TestClient) -> None:
    response = client.post("/api/v1/ndvi", json=VENTANA)
    assert response.status_code == 200
    body = response.json()
    assert body["n_observaciones"] == 1
    assert body["ndvi_ultimo"] == 0.42


def test_ndvi_returns_a_real_empty_result_rather_than_an_error(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    _, _, ndvi_client = service_and_fakes
    ndvi_client.series = NDVISeries(observations=[])
    response = client.post("/api/v1/ndvi", json=VENTANA)
    assert response.status_code == 200
    assert response.json()["n_observaciones"] == 0


def test_ndvi_maps_an_ornl_failure_with_nothing_cached_to_502(
    client: TestClient, service_and_fakes: tuple[AgroViaService, FakeClimateClient, FakeNDVIClient],
) -> None:
    _, _, ndvi_client = service_and_fakes
    ndvi_client.error = OrnlMODISError("ORNL DAAC unavailable")
    response = client.post("/api/v1/ndvi", json=VENTANA)
    assert response.status_code == 502


def test_predecir_runs_the_model_on_the_given_features(client: TestClient) -> None:
    response = client.post(
        "/api/v1/predecir",
        json={
            "cultivo_id": "maiz_grano", "modalidad": "temporal", "cve_mun": 8,
            "lluvia_ciclo_mm": 480.0, "temp_media_c": 20.5, "temp_max_c": 27.0,
            "temp_min_extrema_c": 8.0, "radiacion_mj_m2": 20.0,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["probabilidad_exito"] == 0.8
    assert body["clasificacion"] == "alto"


def test_predecir_rejects_an_extra_field(client: TestClient) -> None:
    response = client.post(
        "/api/v1/predecir",
        json={
            "cultivo_id": "maiz_grano", "modalidad": "temporal", "cve_mun": 8,
            "lluvia_ciclo_mm": 480.0, "temp_media_c": 20.5, "temp_max_c": 27.0,
            "temp_min_extrema_c": 8.0, "radiacion_mj_m2": 20.0, "extra": "nope",
        },
    )
    assert response.status_code == 422


def test_municipio_detects_the_nearest_municipality(client: TestClient) -> None:
    response = client.get("/api/v1/municipio", params={"latitud": 24.4442, "longitud": -104.1217})
    assert response.status_code == 200
    body = response.json()
    assert body["cve_mun"] == 8
    assert body["municipio"] == "Guadalupe Victoria"


def test_cultivos_returns_the_full_inifap_catalogue(client: TestClient) -> None:
    response = client.get("/api/v1/cultivos")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == len(load_crops())
    assert all({"cultivo_id", "nombre", "modalidad_recomendada"} <= set(entry) for entry in body)


def test_precios_returns_real_siap_rows(client: TestClient) -> None:
    response = client.post(
        "/api/v1/precios",
        json={"cultivo_id": "maiz_grano", "municipio": "Guadalupe Victoria"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["fuente"].startswith("SIAP")
    assert body["anio_ultimo"] >= 2024
    assert body["municipio"] == "Guadalupe Victoria"
    assert body["registros"]
    assert all("precio_mxn_t" in row for row in body["registros"])


def test_precios_returns_an_explained_empty_result_for_an_unknown_municipality(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/precios",
        json={"cultivo_id": "maiz_grano", "municipio": "Nowhere"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["registros"] == []
    assert body["anio_ultimo"] is None
    assert "No SIAP record" in body["advertencias"][0]


def test_precios_rejects_an_extra_field(client: TestClient) -> None:
    response = client.post(
        "/api/v1/precios",
        json={"cultivo_id": "maiz_grano", "municipio": "Guadalupe Victoria", "extra": "nope"},
    )
    assert response.status_code == 422
