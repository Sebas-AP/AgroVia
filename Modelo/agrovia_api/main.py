"""FastAPI application exposing the AgroVia parcel evaluation."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import JSONResponse

from . import __version__
from .clients.nasa_power import NasaPowerError
from .clients.ornl_modis import OrnlMODISError
from .config import DEFAULT_PARCEL_EXAMPLE
from .errors import EvaluationError
from .schemas import ParcelaInput, RespuestaEvaluacion
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


def _evaluate(service: AgroViaService, parcela: ParcelaInput) -> RespuestaEvaluacion:
    try:
        return service.evaluate(parcela)
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


@app.exception_handler(FileNotFoundError)
def _missing_artifact_handler(_request, exc: FileNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})
