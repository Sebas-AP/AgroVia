import type {
  NDVIMODIS, ClimaNASA, EvaluacionModelo, MunicipioDetectado, VentanaInput, PrediccionInput,
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

  predecir(input: PrediccionInput): Promise<EvaluacionModelo> {
    return this.post('/api/v1/predecir', input)
  }

  municipio(latitud: number, longitud: number): Promise<MunicipioDetectado> {
    return this.request(`/api/v1/municipio?latitud=${latitud}&longitud=${longitud}`)
  }
}
