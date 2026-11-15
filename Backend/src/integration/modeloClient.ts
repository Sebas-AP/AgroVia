import type { NDVIMODIS, EvaluacionModelo, VentanaInput, PrediccionInput } from './modeloTypes'

export class ModeloHttpError extends Error {}

export interface ModeloClientOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
}

// Thin HTTP client for the Modelo FastAPI service's narrow routes (Modelo/agrovia_api/main.py).
// Only wraps what the Backend actually calls today — see INTEGRACION.md for why
// /api/v1/clima and /api/v1/cultivos aren't consumed yet.
export class ModeloClient {
  constructor(private readonly options: ModeloClientOptions) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const fetchFn = this.options.fetchImpl ?? fetch
    const response = await fetchFn(`${this.options.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      throw new ModeloHttpError(`Modelo ${path} returned ${response.status}: ${await response.text()}`)
    }
    return response.json() as Promise<T>
  }

  ndvi(input: VentanaInput): Promise<NDVIMODIS> {
    return this.post('/api/v1/ndvi', input)
  }

  predecir(input: PrediccionInput): Promise<EvaluacionModelo> {
    return this.post('/api/v1/predecir', input)
  }
}
