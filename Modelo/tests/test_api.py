"""Endpoint-level tests for the FastAPI application (fully offline)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from agrovia_api.catalogs import load_crops, load_municipalities
from agrovia_api.main import app, get_service
from agrovia_api.service import AgroViaService
from tests.fakes import FakeClimateClient, FakeModelRunner, FakeNDVIClient
from tests.test_service import PARCELA


def _fake_service() -> AgroViaService:
    return AgroViaService(
        climate_client=FakeClimateClient(),
        ndvi_client=FakeNDVIClient(),
        model_runner=FakeModelRunner(probability=0.75),
        crops=load_crops(),
        municipalities=load_municipalities(),
        today=date(2026, 11, 14),
    )


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_service] = _fake_service
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_post_evaluar_parcela(client: TestClient) -> None:
    response = client.post("/api/v1/evaluar-parcela", json=PARCELA)
    assert response.status_code == 200

    body = response.json()
    assert body["municipio"]["cve_mun"] == 8
    assert body["cultivo"]["cultivo_id"] == "maiz_grano"
    assert body["evaluacion_modelo"]["probabilidad_exito"] == 0.75
    assert body["clima"]["fuente"].startswith("NASA POWER")


def test_post_evaluar_parcela_invalid_crop(client: TestClient) -> None:
    response = client.post(
        "/api/v1/evaluar-parcela", json=dict(PARCELA, cultivo_actual="quinoa")
    )
    assert response.status_code == 422


def test_post_evaluar_parcela_missing_field(client: TestClient) -> None:
    payload = {key: value for key, value in PARCELA.items() if key != "latitud"}
    response = client.post("/api/v1/evaluar-parcela", json=payload)
    assert response.status_code == 422


def test_post_evaluar_parcela_rejects_extra_field(client: TestClient) -> None:
    response = client.post(
        "/api/v1/evaluar-parcela", json=dict(PARCELA, extra="nope")
    )
    assert response.status_code == 422


def test_get_example_parcel(client: TestClient) -> None:
    response = client.get("/api/v1/evaluar-parcela/ejemplo")
    assert response.status_code == 200
    assert response.json()["cultivo"]["cultivo_id"] == "maiz_grano"
