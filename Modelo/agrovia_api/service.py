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
from .cache import TTLCache
from .catalogs import load_crops, load_municipalities
from .clients.nasa_power import ClimateAggregate, ClimateDailyPoint, NasaPowerClient
from .clients.ornl_modis import NDVISeries, OrnlMODISClient, OrnlMODISError
from .config import CLIMATE_CACHE_TTL_SECONDS, MODEL_PATH, NDVI_CACHE_TTL_SECONDS
from .errors import InvalidCropError, InvalidModalityError, InvalidParcelError
from .geo import nearest_municipality
from .model_runner import ModelRunner, classify_probability
from .prices import SiapPriceDataset, load_price_dataset, lookup_prices
from .schemas import (
    NDVIMODIS,
    ClimaDiario,
    ClimaNASA,
    CultivoInfo,
    EvaluacionAgronomica,
    EvaluacionModelo,
    MunicipioDetectado,
    ParcelaInput,
    PreciosInput,
    PreciosSIAP,
    PrediccionInput,
    PuntajeVariable,
    PuntoClima,
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
        climate_cache: TTLCache[ClimateAggregate] | None = None,
        ndvi_cache: TTLCache[NDVISeries] | None = None,
        daily_climate_cache: TTLCache[list[ClimateDailyPoint]] | None = None,
        prices: SiapPriceDataset | None = None,
    ) -> None:
        self._climate_client = climate_client
        self._ndvi_client = ndvi_client
        self._model_runner = model_runner
        self._crops = crops
        self._municipalities = municipalities
        self._today = today
        self._climate_cache = climate_cache or TTLCache[ClimateAggregate](CLIMATE_CACHE_TTL_SECONDS)
        self._ndvi_cache = ndvi_cache or TTLCache[NDVISeries](NDVI_CACHE_TTL_SECONDS)
        # Same TTL as the aggregate cache, same (lat, lon, window) key — a separate cache
        # because the cached value shape differs (a day list, not one aggregate).
        self._daily_climate_cache = daily_climate_cache or TTLCache[list[ClimateDailyPoint]](
            CLIMATE_CACHE_TTL_SECONDS
        )
        self._prices = prices or load_price_dataset()

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

        climate = self._fetch_climate(
            parcela.latitud, parcela.longitud, window_start, window_end, warnings
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
            cultivo=self._crop_info(crop_id, crop, cycle_days),
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

    @staticmethod
    def _window_key(latitude: float, longitude: float, start: date, end: date) -> tuple:
        return (round(latitude, 4), round(longitude, 4), start.isoformat(), end.isoformat())

    def _fetch_climate(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
        warnings: list[str] | None = None,
    ) -> ClimateAggregate:
        key = self._window_key(latitude, longitude, start, end)
        cached = self._climate_cache.get(key)
        if cached is not None:
            return cached
        try:
            climate = self._climate_client.fetch_cycle(latitude, longitude, start, end)
        except Exception:
            # Climate is required to run the model at all -- fall back to the last known value
            # for this exact (lat, lon, window) only if one actually exists; never fabricate one.
            stale = self._climate_cache.get_stale(key)
            if stale is not None:
                if warnings is not None:
                    warnings.append(
                        "No se pudo consultar NASA POWER; se usó el último clima en caché para "
                        "esta coordenada y ventana."
                    )
                return stale
            raise
        self._climate_cache.set(key, climate)
        return climate

    def _fetch_ndvi_series(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
        warnings: list[str] | None = None,
    ) -> NDVISeries | None:
        """NDVI client call behind the cache, with the same stale-fallback-on-failure shape as
        _fetch_climate. Returns None only when the client failed AND nothing is cached — a
        successful call with zero observations still returns a (empty) NDVISeries, which is
        real data, not a failure."""
        key = self._window_key(latitude, longitude, start, end)
        series = self._ndvi_cache.get(key)
        if series is not None:
            return series
        try:
            series = self._ndvi_client.fetch_ndvi(latitude, longitude, start, end)
        except Exception as exc:  # noqa: BLE001 - NDVI is supplementary
            stale = self._ndvi_cache.get_stale(key)
            if stale is not None:
                if warnings is not None:
                    warnings.append(
                        f"No se pudo consultar NDVI de ORNL DAAC ({exc}); se usó el último "
                        "NDVI en caché para esta coordenada y ventana."
                    )
                return stale
            if warnings is not None:
                warnings.append(
                    f"No se pudo consultar NDVI de ORNL DAAC ({exc}); "
                    "la evaluación continúa sin este indicador."
                )
            return None
        self._ndvi_cache.set(key, series)
        return series

    @staticmethod
    def _ndvi_response(series: NDVISeries, start: date, end: date, ndvi_client: OrnlMODISClient) -> NDVIMODIS:
        return NDVIMODIS(
            fuente="ORNL DAAC MODIS/VIIRS Land Products Web Service",
            producto=ndvi_client.product,
            banda=ndvi_client.band,
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

    def _fetch_ndvi(
        self,
        latitude: float,
        longitude: float,
        start: date,
        end: date,
        warnings: list[str],
    ) -> NDVIMODIS | None:
        series = self._fetch_ndvi_series(latitude, longitude, start, end, warnings)
        if series is None:
            return None
        if series.count == 0:
            warnings.append(
                "ORNL DAAC no devolvió compuestos NDVI para la ventana solicitada."
            )
            return None
        return self._ndvi_response(series, start, end, self._ndvi_client)

    def fetch_climate_window(
        self, latitud: float, longitud: float, inicio: date, fin: date,
    ) -> ClimaNASA:
        """Narrow route backing POST /api/v1/clima — same cache as the composite evaluation."""
        climate = self._fetch_climate(latitud, longitud, inicio, fin)
        return ClimaNASA(
            fuente="NASA POWER daily point (community AG)",
            ventana_inicio=inicio,
            ventana_fin=fin,
            n_dias=climate.n_dias,
            lluvia_ciclo_mm=climate.lluvia_ciclo_mm,
            temp_media_c=climate.temp_media_c,
            temp_max_c=climate.temp_max_c,
            temp_min_extrema_c=climate.temp_min_extrema_c,
            radiacion_mj_m2=climate.radiacion_mj_m2,
        )

    def fetch_daily_climate_window(
        self, latitud: float, longitud: float, inicio: date, fin: date,
    ) -> ClimaDiario:
        """Narrow route backing POST /api/v1/clima/diario — the real per-day NASA POWER values
        fetch_cycle discards after aggregating, for consumers that need true daily granularity
        (the Backend's ModeloClimateProvider / indicators engine) instead of one window average.
        Does not touch fetch_climate_window/_fetch_climate or their cache; completely separate
        request and cache, by design (see nasa_power.py)."""
        key = self._window_key(latitud, longitud, inicio, fin)
        points = self._daily_climate_cache.get(key)
        if points is None:
            try:
                points = self._climate_client.fetch_daily_series(latitud, longitud, inicio, fin)
            except Exception:
                stale = self._daily_climate_cache.get_stale(key)
                if stale is None:
                    raise
                points = stale
            else:
                self._daily_climate_cache.set(key, points)

        return ClimaDiario(
            fuente="NASA POWER daily point (community AG)",
            ventana_inicio=inicio,
            ventana_fin=fin,
            parametros=sorted({name for point in points for name in point.valores}),
            serie=[PuntoClima(fecha=point.fecha, valores=point.valores) for point in points],
        )

    def fetch_ndvi_window(
        self, latitud: float, longitud: float, inicio: date, fin: date,
    ) -> NDVIMODIS:
        """Narrow route backing POST /api/v1/ndvi. Unlike the composite path's silent
        degrade-to-None, a genuine upstream failure with nothing cached raises OrnlMODISError
        (mapped to 502 in main.py) rather than returning an empty-looking success; a real empty
        result (zero observations) still returns normally."""
        series = self._fetch_ndvi_series(latitud, longitud, inicio, fin)
        if series is None:
            raise OrnlMODISError(
                "ORNL DAAC could not be reached and no cached NDVI exists for this window"
            )
        return self._ndvi_response(series, inicio, fin, self._ndvi_client)

    def predict_from_features(self, payload: PrediccionInput) -> EvaluacionModelo:
        """Narrow route backing POST /api/v1/predecir — runs the trained model directly on an
        already-resolved feature set, without re-deriving cultivo_id/modalidad from raw strings
        the way evaluate() does."""
        features = {
            "cultivo_id": payload.cultivo_id,
            "modalidad": payload.modalidad,
            "cve_mun": payload.cve_mun,
            "lluvia_ciclo_mm": payload.lluvia_ciclo_mm,
            "temp_media_c": payload.temp_media_c,
            "temp_max_c": payload.temp_max_c,
            "temp_min_extrema_c": payload.temp_min_extrema_c,
            "radiacion_mj_m2": payload.radiacion_mj_m2,
        }
        probability, predicted_class = self._model_runner.predict(features)
        return EvaluacionModelo(
            modelo=self._model_runner.model_path.name,
            probabilidad_exito=round(probability, 4),
            clase_predicha=predicted_class,
            clasificacion=classify_probability(probability),
        )

    def fetch_prices(self, payload: PreciosInput) -> PreciosSIAP:
        """Narrow route backing POST /api/v1/precios. Real SIAP rows only; an unknown
        crop/municipality returns an empty, explained result rather than a substitute value."""
        return lookup_prices(self._prices, payload.cultivo_id, payload.municipio, payload.anio)

    def detect_municipality(self, latitud: float, longitud: float) -> MunicipioDetectado:
        """Narrow route backing GET /api/v1/municipio."""
        municipality, distance_km = nearest_municipality(latitud, longitud, self._municipalities)
        return MunicipioDetectado(
            cve_mun=int(municipality["cve_mun"]),
            municipio=str(municipality["municipio"]),
            distancia_km=round(distance_km, 2),
        )

    def list_crops(self) -> list[CultivoInfo]:
        """Narrow route backing GET /api/v1/cultivos — the full INIFAP catalogue."""
        return [
            self._crop_info(crop_id, crop, [int(d) for d in crop.get("duracion_ciclo_dias", [365, 365])])
            for crop_id, crop in sorted(self._crops.items())
        ]

    @staticmethod
    def _crop_info(crop_id: str, crop: dict[str, Any], cycle_days: list[int]) -> CultivoInfo:
        return CultivoInfo(
            cultivo_id=crop_id,
            nombre=crop.get("nombre", crop_id),
            familia=crop.get("familia", "desconocida"),
            ciclo_principal=crop.get("ciclo_principal", "desconocido"),
            modalidad_recomendada=list(crop.get("modalidad_recomendada", [])),
            duracion_ciclo_dias=cycle_days,
            notas_tecnicas=crop.get("notas_tecnicas", ""),
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
