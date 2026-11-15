"""Orchestration: turn a parcel profile into a full evaluation response."""

from __future__ import annotations

import unicodedata
from datetime import date
from typing import Any

from .agronomy import (
    TRAPEZOID_KEYS,
    analysis_window,
    classify_agronomic,
    normalize_stage,
    trapezoid_score,
)
from .catalogs import load_crops, load_municipalities
from .clients.nasa_power import ClimateAggregate, NasaPowerClient
from .clients.ornl_modis import OrnlMODISClient
from .config import MODEL_PATH
from .errors import InvalidCropError, InvalidModalityError, InvalidParcelError
from .geo import nearest_municipality
from .model_runner import ModelRunner, classify_probability
from .schemas import (
    NDVIMODIS,
    ClimaNASA,
    CultivoInfo,
    EvaluacionAgronomica,
    EvaluacionModelo,
    MunicipioDetectado,
    ParcelaInput,
    PuntajeVariable,
    PuntoNDVI,
    RespuestaEvaluacion,
    VentanaAnalisis,
)

MODALITY_SYNONYMS = {
    "temporal": "temporal",
    "secano": "temporal",
    "riego": "riego",
    "irrigacion": "riego",
    "gravedad": "riego",
    "goteo": "riego",
    "aspersion": "riego",
}

# Maps each trapezoid variable in the catalogue to the climate feature used.
TRAPEZOID_FEATURE = {
    "lluvia_mm": "lluvia_ciclo_mm",
    "temp_media_c": "temp_media_c",
    "temp_min_ciclo_c": "temp_min_extrema_c",
    "radiacion_mj_m2": "radiacion_mj_m2",
}


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(without_accents.lower().strip().split())


class AgroViaService:
    """Coordinates satellite data, the agronomic catalogue and the model."""

    def __init__(
        self,
        climate_client: NasaPowerClient,
        ndvi_client: OrnlMODISClient,
        model_runner: ModelRunner,
        crops: dict[str, dict[str, Any]],
        municipalities: list[dict[str, Any]],
        today: date | None = None,
    ) -> None:
        self._climate_client = climate_client
        self._ndvi_client = ndvi_client
        self._model_runner = model_runner
        self._crops = crops
        self._municipalities = municipalities
        self._today = today

    def evaluate(self, parcela: ParcelaInput) -> RespuestaEvaluacion:
        today = self._today or date.today()
        warnings: list[str] = []

        if parcela.fecha_siembra > today:
            raise InvalidParcelError(
                "fecha_siembra is in the future; cannot evaluate a parcel "
                "that has not been sown"
            )

        crop_id = _normalize(parcela.cultivo_actual)
        crop = self._crops.get(crop_id)
        if crop is None:
            valid = ", ".join(sorted(self._crops))
            raise InvalidCropError(
                f"Unknown cultivo_actual '{parcela.cultivo_actual}'. "
                f"Valid values: {valid}"
            )

        modality = MODALITY_SYNONYMS.get(_normalize(parcela.sistema_riego))
        if modality is None:
            raise InvalidModalityError(
                f"Unknown sistema_riego '{parcela.sistema_riego}'. "
                "Expected 'temporal' or 'riego'."
            )

        municipality, distance_km = nearest_municipality(
            parcela.latitud, parcela.longitud, self._municipalities
        )
        cve_mun = int(municipality["cve_mun"])

        stage = normalize_stage(parcela.etapa_crecimiento)
        if stage == "desconocida":
            warnings.append(
                f"Etapa de crecimiento no reconocida "
                f"('{parcela.etapa_crecimiento}'); se asume ciclo completo."
            )

        cycle_days = [int(day) for day in crop.get("duracion_ciclo_dias", [365, 365])]
        window_start, window_end = analysis_window(
            parcela.fecha_siembra, stage, cycle_days, today=today
        )

        climate = self._climate_client.fetch_cycle(
            parcela.latitud, parcela.longitud, window_start, window_end
        )

        ndvi = self._fetch_ndvi(
            parcela.latitud, parcela.longitud, window_start, window_end, warnings
        )

        features = {
            "cultivo_id": crop_id,
            "modalidad": modality,
            "cve_mun": cve_mun,
            "lluvia_ciclo_mm": climate.lluvia_ciclo_mm,
            "temp_media_c": climate.temp_media_c,
            "temp_max_c": climate.temp_max_c,
            "temp_min_extrema_c": climate.temp_min_extrema_c,
            "radiacion_mj_m2": climate.radiacion_mj_m2,
        }
        probability, predicted_class = self._model_runner.predict(features)

        agronomic = self._score_crop(crop, climate)
        self._add_advisories(
            crop, modality, probability, agronomic.puntaje_global, warnings
        )

        return RespuestaEvaluacion(
            parcela=parcela,
            municipio=MunicipioDetectado(
                cve_mun=cve_mun,
                municipio=str(municipality["municipio"]),
                distancia_km=round(distance_km, 2),
            ),
            cultivo=CultivoInfo(
                cultivo_id=crop_id,
                nombre=crop.get("nombre", crop_id),
                familia=crop.get("familia", "desconocida"),
                ciclo_principal=crop.get("ciclo_principal", "desconocido"),
                modalidad_recomendada=list(crop.get("modalidad_recomendada", [])),
                duracion_ciclo_dias=cycle_days,
                notas_tecnicas=crop.get("notas_tecnicas", ""),
            ),
            ventana_analisis=VentanaAnalisis(
                inicio=window_start,
                fin=window_end,
                etapa_crecimiento=stage,
                dias=(window_end - window_start).days + 1,
            ),
            clima=ClimaNASA(
                fuente="NASA POWER daily point (community AG)",
                ventana_inicio=window_start,
                ventana_fin=window_end,
                n_dias=climate.n_dias,
                lluvia_ciclo_mm=climate.lluvia_ciclo_mm,
                temp_media_c=climate.temp_media_c,
                temp_max_c=climate.temp_max_c,
                temp_min_extrema_c=climate.temp_min_extrema_c,
                radiacion_mj_m2=climate.radiacion_mj_m2,
            ),
            ndvi=ndvi,
            evaluacion_modelo=EvaluacionModelo(
                modelo=self._model_runner.model_path.name,
                probabilidad_exito=round(probability, 4),
                clase_predicha=predicted_class,
                clasificacion=classify_probability(probability),
            ),
            evaluacion_agronomica=agronomic,
            advertencias=warnings,
        )

    def _fetch_ndvi(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
        warnings: list[str],
    ) -> NDVIMODIS | None:
        try:
            series = self._ndvi_client.fetch_ndvi(latitude, longitude, start, end)
        except Exception as exc:  # noqa: BLE001 - NDVI is supplementary
            warnings.append(
                f"No se pudo consultar NDVI de ORNL DAAC ({exc}); "
                "la evaluación continúa sin este indicador."
            )
            return None

        if series.count == 0:
            warnings.append(
                "ORNL DAAC no devolvió compuestos NDVI para la ventana solicitada."
            )
            return None

        return NDVIMODIS(
            fuente="ORNL DAAC MODIS/VIIRS Land Products Web Service",
            producto=self._ndvi_client.product,
            banda=self._ndvi_client.band,
            ventana_inicio=start,
            ventana_fin=end,
            n_observaciones=series.count,
            ndvi_medio=_round(series.mean),
            ndvi_max=_round(series.maximum),
            ndvi_min=_round(series.minimum),
            ndvi_ultimo=_round(series.latest),
            serie=[
                PuntoNDVI(fecha=observation.fecha, ndvi=observation.ndvi)
                for observation in series.observations
            ],
        )

    def _score_crop(
        self, crop: dict[str, Any], climate: ClimateAggregate
    ) -> EvaluacionAgronomica:
        scores: list[PuntajeVariable] = []
        for key in TRAPEZOID_KEYS:
            thresholds = crop.get(key)
            if not isinstance(thresholds, list) or len(thresholds) != 4:
                continue
            value = float(getattr(climate, TRAPEZOID_FEATURE[key]))
            scores.append(
                PuntajeVariable(
                    variable=key,
                    valor=round(value, 2),
                    umbral=[float(limit) for limit in thresholds],
                    puntaje=round(trapezoid_score(value, thresholds), 4),
                )
            )

        global_score = (
            sum(score.puntaje for score in scores) / len(scores) if scores else 0.0
        )
        return EvaluacionAgronomica(
            puntaje_global=round(global_score, 4),
            clasificacion=classify_agronomic(global_score),
            puntajes=scores,
        )

    def _add_advisories(
        self,
        crop: dict[str, Any],
        modality: str,
        probability: float,
        agronomic_score: float,
        warnings: list[str],
    ) -> None:
        recommended = crop.get("modalidad_recomendada", [])
        if recommended and modality not in recommended:
            warnings.append(
                f"La modalidad '{modality}' no está entre las recomendadas "
                f"para este cultivo ({', '.join(recommended)})."
            )
        if agronomic_score < 0.40:
            warnings.append(
                "El clima de la ventana analizada es inadecuado según los "
                "umbrales del catálogo INIFAP."
            )
        if probability < 0.33:
            warnings.append(
                "La probabilidad de éxito de cosecha estimada por el modelo "
                "es baja."
            )


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(value, digits)


def build_default_service(today: date | None = None) -> AgroViaService:
    """Construct the production service wired to the live APIs and model."""
    return AgroViaService(
        climate_client=NasaPowerClient(),
        ndvi_client=OrnlMODISClient(),
        model_runner=ModelRunner(MODEL_PATH),
        crops=load_crops(),
        municipalities=load_municipalities(),
        today=today,
    )
