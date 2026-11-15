"""FastAPI application exposing the AgroVia parcel evaluation."""

from __future__ import annotations

import json
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Annotated, TypeVar

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from . import __version__
from .clients.nasa_power import NasaPowerError
from .clients.ornl_modis import OrnlMODISError
from .config import DEFAULT_PARCEL_EXAMPLE
from .errors import EvaluationError
from .schemas import (
    NDVIMODIS,
    ClimaNASA,
    CultivoInfo,
    EvaluacionModelo,
    MunicipioDetectado,
    ParcelaInput,
    PrediccionInput,
    RespuestaEvaluacion,
    VentanaInput,
)
from .service import AgroViaService, build_default_service

app = FastAPI(
    title="AgroVia Parcel Evaluation API",
    version=__version__,
    description=(
        "Evaluates a detailed Durango parcel profile by combining NASA POWER "
        "climate data, ORNL DAAC MODIS NDVI and the trained AgroVia model."
    ),
)


@lru_cache(maxsize=1)
def get_service() -> AgroViaService:
    """Return the process-wide production service (overridable in tests)."""
    return build_default_service()


def load_parcela_from_file(path: Path) -> ParcelaInput:
    """Parse a parcel profile JSON file into the input contract."""
    with Path(path).open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return ParcelaInput.model_validate(payload)


T = TypeVar("T")


def _run_with_upstream_errors(action: Callable[[], T]) -> T:
    try:
        return action()
    except EvaluationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NasaPowerError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream NASA POWER error: {exc}",
        ) from exc
    except OrnlMODISError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream ORNL DAAC error: {exc}",
        ) from exc


def _evaluate(service: AgroViaService, parcela: ParcelaInput) -> RespuestaEvaluacion:
    return _run_with_upstream_errors(lambda: service.evaluate(parcela))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/api/v1/evaluar-parcela", response_model=RespuestaEvaluacion)
def evaluar_parcela(
    parcela: ParcelaInput,
    service: Annotated[AgroViaService, Depends(get_service)],
) -> RespuestaEvaluacion:
    """Evaluate a parcel profile supplied in the request body."""
    return _evaluate(service, parcela)


@app.get("/api/v1/evaluar-parcela/ejemplo", response_model=RespuestaEvaluacion)
def evaluar_parcela_ejemplo(
    service: Annotated[AgroViaService, Depends(get_service)],
) -> RespuestaEvaluacion:
    """Evaluate the bundled example parcel file."""
    if not DEFAULT_PARCEL_EXAMPLE.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Example parcel file not found: {DEFAULT_PARCEL_EXAMPLE}",
        )
    parcela = load_parcela_from_file(DEFAULT_PARCEL_EXAMPLE)
    return _evaluate(service, parcela)


@app.post("/api/v1/clima", response_model=ClimaNASA)
def clima(
    ventana: VentanaInput,
    service: Annotated[AgroViaService, Depends(get_service)],
) -> ClimaNASA:
    """Narrow, crop-independent NASA POWER lookup — see Modelo/agrovia_api/cache.py."""
    return _run_with_upstream_errors(
        lambda: service.fetch_climate_window(ventana.latitud, ventana.longitud, ventana.inicio, ventana.fin)
    )


@app.post("/api/v1/ndvi", response_model=NDVIMODIS)
def ndvi(
    ventana: VentanaInput,
    service: Annotated[AgroViaService, Depends(get_service)],
) -> NDVIMODIS:
    """Narrow, crop-independent ORNL DAAC MODIS NDVI lookup."""
    return _run_with_upstream_errors(
        lambda: service.fetch_ndvi_window(ventana.latitud, ventana.longitud, ventana.inicio, ventana.fin)
    )


@app.post("/api/v1/predecir", response_model=EvaluacionModelo)
def predecir(
    payload: PrediccionInput,
    service: Annotated[AgroViaService, Depends(get_service)],
) -> EvaluacionModelo:
    """Runs the trained model directly on an already-resolved feature set."""
    return service.predict_from_features(payload)


@app.get("/api/v1/municipio", response_model=MunicipioDetectado)
def municipio(
    service: Annotated[AgroViaService, Depends(get_service)],
    latitud: Annotated[float, Query(ge=-90.0, le=90.0)],
    longitud: Annotated[float, Query(ge=-180.0, le=180.0)],
) -> MunicipioDetectado:
    return service.detect_municipality(latitud, longitud)


@app.get("/api/v1/cultivos", response_model=list[CultivoInfo])
def cultivos(
    service: Annotated[AgroViaService, Depends(get_service)],
) -> list[CultivoInfo]:
    """The full INIFAP crop catalogue (datasets/cultivos_inifap.json)."""
    return service.list_crops()


@app.exception_handler(FileNotFoundError)
def _missing_artifact_handler(_request, exc: FileNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})
