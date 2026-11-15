import { describe, it, expect } from 'vitest'
import { ModeloNdviProvider } from '../../src/providers/NdviProvider'
import { ModeloClient } from '../../src/integration/modeloClient'
import { computeCellId } from '../../src/firestore/cellId'

// A double standing in for the live Modelo service (per the integration plan's test
// requirements), not a real HTTP call.
function fakeModeloFetch(body: unknown, status = 200): typeof fetch {
  return (async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('ModeloNdviProvider', () => {
  it('maps a successful /api/v1/ndvi response into NdviDay[]', async () => {
    const client = new ModeloClient({
      baseUrl: 'http://modelo.test',
      fetchImpl: fakeModeloFetch({
        fuente: 'ORNL DAAC MODIS/VIIRS Land Products Web Service',
        producto: 'MOD13Q1',
        banda: '250m_16_days_NDVI',
        ventana_inicio: '2026-06-01',
        ventana_fin: '2026-07-01',
        n_observaciones: 1,
        ndvi_medio: 0.42,
        ndvi_max: 0.42,
        ndvi_min: 0.42,
        ndvi_ultimo: 0.42,
        serie: [{ fecha: '2026-06-17', ndvi: 0.42 }],
      }),
    })
    const provider = new ModeloNdviProvider(client)
    const cellId = computeCellId(24.4497, -104.1225, 'modis')

    const series = await provider.getSeries(cellId, '2026-06-01', '2026-07-01')

    expect(series).toEqual([
      {
        date: '2026-06-17',
        ndvi: 0.42,
        evi: Number.NaN,
        qualityOk: true,
        provenance: {
          source: 'ORNL DAAC MODIS/VIIRS Land Products Web Service',
          product: 'MOD13Q1',
          version: 'live-1',
          asOf: '2026-07-01',
          latencyDays: 0,
          kind: 'satelliteObservation',
          origin: 'real',
        },
      },
    ])
  })

  it('decodes the point behind the cellId, not the raw snapped string, when calling Modelo', async () => {
    let capturedBody: unknown
    const client = new ModeloClient({
      baseUrl: 'http://modelo.test',
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init!.body as string)
        return new Response(JSON.stringify({
          fuente: 'test', producto: 'test', banda: 'test',
          ventana_inicio: '2026-06-01', ventana_fin: '2026-07-01',
          n_observaciones: 0, ndvi_medio: null, ndvi_max: null, ndvi_min: null, ndvi_ultimo: null,
          serie: [],
        }), { status: 200 })
      }) as unknown as typeof fetch,
    })
    const provider = new ModeloNdviProvider(client)
    const cellId = computeCellId(24.4497, -104.1225, 'modis')

    await provider.getSeries(cellId, '2026-06-01', '2026-07-01')

    expect(capturedBody).toMatchObject({ latitud: expect.any(Number), longitud: expect.any(Number) })
    expect((capturedBody as { latitud: number }).latitud).toBeCloseTo(24.4497, 1)
  })

  it('surfaces a non-2xx Modelo response as a ModeloHttpError', async () => {
    const client = new ModeloClient({ baseUrl: 'http://modelo.test', fetchImpl: fakeModeloFetch({ detail: 'boom' }, 502) })
    const provider = new ModeloNdviProvider(client)
    await expect(provider.getSeries(computeCellId(24.4497, -104.1225, 'modis'), '2026-06-01', '2026-07-01'))
      .rejects.toThrow(/502/)
  })
})
