import type {
  NDVIMODIS, ClimaNASA, ClimaDiario, EvaluacionModelo, MunicipioDetectado, VentanaInput,
  PrediccionInput, PreciosInput, PreciosSIAP, CultivoInfo,
} from './modeloTypes'

export class ModeloHttpError extends Error {}

export interface ModeloClientOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
}

// Thin HTTP client for the Modelo FastAPI service's narrow routes (Modelo/agrovia_api/main.py).
// Only wraps what the Backend actually calls today — see INTEGRACION.md for why
// /api/v1/clima is used here (feeding /predecir's aggregate-shaped features) but not as a
// ClimateProvider, and /api/v1/cultivos isn't consumed at all.
export class ModeloClient {
  constructor(private readonly options: ModeloClientOptions) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const fetchFn = this.options.fetchImpl ?? fetch
    const response = await fetchFn(`${this.options.baseUrl}${path}`, init)
    if (!response.ok) {
      throw new ModeloHttpError(`Modelo ${path} returned ${response.status}: ${await response.text()}`)
    }
    return response.json() as Promise<T>
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  ndvi(input: VentanaInput): Promise<NDVIMODIS> {
    return this.post('/api/v1/ndvi', input)
  }

  clima(input: VentanaInput): Promise<ClimaNASA> {
    return this.post('/api/v1/clima', input)
  }

  // Real per-day NASA POWER values (Modelo/agrovia_api/main.py, clima_diario) — a separate
  // route and cache from /api/v1/clima, which returns a single window aggregate.
  climaDiario(input: VentanaInput): Promise<ClimaDiario> {
    return this.post('/api/v1/clima/diario', input)
  }

  predecir(input: PrediccionInput): Promise<EvaluacionModelo> {
    return this.post('/api/v1/predecir', input)
  }

  // Real SIAP municipal price/yield rows (Modelo/agrovia_api/prices.py). Returns every year the
  // dataset has for this crop/municipality; the Backend picks the latest one it can use.
  precios(input: PreciosInput): Promise<PreciosSIAP> {
    return this.post('/api/v1/precios', input)
  }

  municipio(latitud: number, longitud: number): Promise<MunicipioDetectado> {
    return this.request(`/api/v1/municipio?latitud=${latitud}&longitud=${longitud}`)
  }

  // Full INIFAP catalog (Modelo/datasets/cultivos_inifap.json), used by engines/via/retrieval.ts
  // as the knowledge base for VÍA's grounding, not by the rotation scorer (see INTEGRACION.md §5).
  cultivos(): Promise<CultivoInfo[]> {
    return this.request('/api/v1/cultivos')
  }
}
