"""Pydantic contracts for the parcel-evaluation API.

The input contract is the exact parcel profile requested by the product team.
The output contract mirrors the trained model plus the agronomic diagnosis so
downstream clients (AppMovil / Backend) can render a single payload.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ParcelaInput(BaseModel):
    """Detailed parcel profile accepted by ``POST /api/v1/evaluar-parcela``."""

    model_config = ConfigDict(extra="forbid")

    latitud: float = Field(..., ge=-90.0, le=90.0, description="Latitude (WGS84).")
    longitud: float = Field(..., ge=-180.0, le=180.0, description="Longitude (WGS84).")
    superficie_hectareas: float = Field(..., gt=0.0, description="Parcel area (ha).")
    tipo_terreno: str = Field(..., min_length=1, description="e.g. plano, ondulado.")
    tipo_suelo: str = Field(..., min_length=1, description="e.g. franco, arcilloso.")
    disponibilidad_agua: str = Field(
        ..., min_length=1, description="e.g. limitada, suficiente."
    )
    sistema_riego: str = Field(
        ..., min_length=1, description="temporal or riego."
    )
    cultivo_actual: str = Field(
        ..., min_length=1, description="Key from the INIFAP crop catalogue."
    )
    fecha_siembra: date = Field(..., description="Sowing date (YYYY-MM-DD).")
    etapa_crecimiento: str = Field(
        ..., min_length=1, description="Current phenological stage."
    )


class VentanaInput(BaseModel):
    """Shared input for the narrow /clima and /ndvi routes: a coordinate and date window,
    independent of any crop (see Modelo/agrovia_api/cache.py)."""

    model_config = ConfigDict(extra="forbid")

    latitud: float = Field(..., ge=-90.0, le=90.0)
    longitud: float = Field(..., ge=-180.0, le=180.0)
    inicio: date
    fin: date


class PrediccionInput(BaseModel):
    """Input for POST /api/v1/predecir: the model's exact feature set (model_runner.FEATURES).
    The caller (the Backend) is expected to have already resolved cultivo_id/modalidad (e.g. via
    GET /api/v1/cultivos), not raw user-facing strings like 'maiz_grano'/'riego por goteo'."""

    model_config = ConfigDict(extra="forbid")

    cultivo_id: str = Field(..., min_length=1)
    modalidad: str = Field(..., min_length=1)
    cve_mun: int
    lluvia_ciclo_mm: float
    temp_media_c: float
    temp_max_c: float
    temp_min_extrema_c: float
    radiacion_mj_m2: float


class MunicipioDetectado(BaseModel):
    cve_mun: int
    municipio: str
    distancia_km: float


class PuntoClima(BaseModel):
    """One real NASA POWER day. `valores` only has the parameters that actually had a usable
    reading that day — a missing one is just absent, never filled in or interpolated."""

    fecha: date
    valores: dict[str, float]


class ClimaDiario(BaseModel):
    fuente: str
    ventana_inicio: date
    ventana_fin: date
    parametros: list[str]
    serie: list[PuntoClima]


class CultivoInfo(BaseModel):
    cultivo_id: str
    nombre: str
    familia: str
    ciclo_principal: str
    modalidad_recomendada: list[str]
    duracion_ciclo_dias: list[int]
    notas_tecnicas: str


class VentanaAnalisis(BaseModel):
    inicio: date
    fin: date
    etapa_crecimiento: str
    dias: int


class ClimaNASA(BaseModel):
    fuente: str
    ventana_inicio: date
    ventana_fin: date
    n_dias: int
    lluvia_ciclo_mm: float
    temp_media_c: float
    temp_max_c: float
    temp_min_extrema_c: float
    radiacion_mj_m2: float


class PuntoNDVI(BaseModel):
    fecha: date
    ndvi: float


class NDVIMODIS(BaseModel):
    fuente: str
    producto: str
    banda: str
    ventana_inicio: date
    ventana_fin: date
    n_observaciones: int
    ndvi_medio: float | None
    ndvi_max: float | None
    ndvi_min: float | None
    ndvi_ultimo: float | None
    serie: list[PuntoNDVI]


class EvaluacionModelo(BaseModel):
    modelo: str
    probabilidad_exito: float
    clase_predicha: int
    clasificacion: str


class PuntajeVariable(BaseModel):
    variable: str
    valor: float
    umbral: list[float]
    puntaje: float


class EvaluacionAgronomica(BaseModel):
    puntaje_global: float
    clasificacion: str
    puntajes: list[PuntajeVariable]


class RespuestaEvaluacion(BaseModel):
    parcela: ParcelaInput
    municipio: MunicipioDetectado
    cultivo: CultivoInfo
    ventana_analisis: VentanaAnalisis
    clima: ClimaNASA
    ndvi: NDVIMODIS | None
    evaluacion_modelo: EvaluacionModelo
    evaluacion_agronomica: EvaluacionAgronomica
    advertencias: list[str]
