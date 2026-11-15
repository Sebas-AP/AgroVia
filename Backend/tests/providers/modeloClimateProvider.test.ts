import { describe, it, expect } from 'vitest'
import { ModeloClimateProvider } from '../../src/providers/ClimateProvider'
import { ModeloClient } from '../../src/integration/modeloClient'
import { computeCellId } from '../../src/firestore/cellId'

// A double standing in for the live Modelo service (same pattern as modeloNdviProvider.test.ts),
// not a real HTTP call.
function fakeModeloFetch(body: unknown, status = 200): typeof fetch {
  return (async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

const CELL_ID = computeCellId(24.4497, -104.1225, 'power')

const CLIMA_DIARIO_RESPONSE = {
  fuente: 'NASA POWER daily point (community AG)',
  ventana_inicio: '2026-07-01',
  ventana_fin: '2026-07-03',
  parametros: ['PRECTOTCORR', 'T2M'],
  serie: [
    { fecha: '2026-07-01', valores: { T2M: 21.5, PRECTOTCORR: 0 } },
    // 2026-07-02 is absent from Modelo's response: no parameter had a usable reading that day.
    { fecha: '2026-07-03', valores: { T2M: 23.1 } },
  ],
}

describe('ModeloClimateProvider', () => {
  it('returns one entry per calendar day, keeping a dataless day as an empty-values gap', async () => {
    const client = new ModeloClient({ baseUrl: 'http://modelo.test', fetchImpl: fakeModeloFetch(CLIMA_DIARIO_RESPONSE) })
    const provider = new ModeloClimateProvider(client)

    const series = await provider.getDailySeries(CELL_ID, '2026-07-01', '2026-07-03')

    expect(series.map((day) => day.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(series[1].values).toEqual({})
    // A day present with only some parameters keeps exactly those, not a filled-in default.
    expect(series[2].values).toEqual({ T2M: 23.1 })
    expect(series[0].values).toEqual({ T2M: 21.5, PRECTOTCORR: 0 })
  })

  it('marks the series as real NASA POWER data with the source Modelo reported', async () => {
    const client = new ModeloClient({ baseUrl: 'http://modelo.test', fetchImpl: fakeModeloFetch(CLIMA_DIARIO_RESPONSE) })
    const provider = new ModeloClimateProvider(client)

    const series = await provider.getDailySeries(CELL_ID, '2026-07-01', '2026-07-03')

    expect(series[0].provenance).toEqual({
      source: 'NASA POWER daily point (community AG)',
      product: 'AG community daily',
      version: 'live-1',
      asOf: '2026-07-03',
      latencyDays: 0,
      kind: 'historical',
      origin: 'real',
    })
  })

  it('calls /api/v1/clima/diario with the point decoded from the cellId, not the raw cell string', async () => {
    let capturedUrl = ''
    let capturedBody: unknown
    const client = new ModeloClient({
      baseUrl: 'http://modelo.test',
      fetchImpl: (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedBody = JSON.parse(init!.body as string)
        return new Response(JSON.stringify(CLIMA_DIARIO_RESPONSE), { status: 200 })
      }) as unknown as typeof fetch,
    })
    const provider = new ModeloClimateProvider(client)

    await provider.getDailySeries(CELL_ID, '2026-07-01', '2026-07-03')

    expect(capturedUrl).toBe('http://modelo.test/api/v1/clima/diario')
    expect(capturedBody).toEqual({
      latitud: 24, longitud: -104.375, inicio: '2026-07-01', fin: '2026-07-03',
    })
  })

  it('surfaces a non-2xx Modelo response as a ModeloHttpError instead of returning fake days', async () => {
    const client = new ModeloClient({ baseUrl: 'http://modelo.test', fetchImpl: fakeModeloFetch({ detail: 'boom' }, 502) })
    const provider = new ModeloClimateProvider(client)

    await expect(provider.getDailySeries(CELL_ID, '2026-07-01', '2026-07-03')).rejects.toThrow(/502/)
  })
})
