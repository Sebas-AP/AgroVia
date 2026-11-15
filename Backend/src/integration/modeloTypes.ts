// TypeScript mirrors of the Modelo FastAPI service's JSON contracts (Modelo/agrovia_api/schemas.py).
// Kept here, not re-derived from the Python source, so a schema drift shows up as a type error
// against real HTTP responses rather than silently.

export interface ParcelaInput {
  latitud: number
  longitud: number
  superficie_hectareas: number
  tipo_terreno: string
  tipo_suelo: string
  disponibilidad_agua: string
  sistema_riego: string
  cultivo_actual: string
  fecha_siembra: string // YYYY-MM-DD
  etapa_crecimiento: string
}

export interface ClimaNASA {
  fuente: string
  ventana_inicio: string
  ventana_fin: string
  n_dias: number
  lluvia_ciclo_mm: number
  temp_media_c: number
  temp_max_c: number
  temp_min_extrema_c: number
  radiacion_mj_m2: number
}

export interface PuntoNDVI {
  fecha: string
  ndvi: number
}

export interface NDVIMODIS {
  fuente: string
  producto: string
  banda: string
  ventana_inicio: string
  ventana_fin: string
  n_observaciones: number
  ndvi_medio: number | null
  ndvi_max: number | null
  ndvi_min: number | null
  ndvi_ultimo: number | null
  serie: PuntoNDVI[]
}

export interface EvaluacionModelo {
  modelo: string
  probabilidad_exito: number
  clase_predicha: number
  clasificacion: 'alto' | 'medio' | 'bajo'
}

export interface CultivoInfo {
  cultivo_id: string
  nombre: string
  familia: string
  ciclo_principal: string
  modalidad_recomendada: string[]
  duracion_ciclo_dias: number[]
  notas_tecnicas: string
}

export interface MunicipioDetectado {
  cve_mun: number
  municipio: string
  distancia_km: number
}

export interface VentanaInput {
  latitud: number
  longitud: number
  inicio: string
  fin: string
}

export interface PrediccionInput {
  cultivo_id: string
  modalidad: string
  cve_mun: number
  lluvia_ciclo_mm: number
  temp_media_c: number
  temp_max_c: number
  temp_min_extrema_c: number
  radiacion_mj_m2: number
}
