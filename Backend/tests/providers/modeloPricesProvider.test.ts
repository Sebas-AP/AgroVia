import { describe, it, expect } from 'vitest'
import { ModeloPricesProvider } from '../../src/providers/ModeloPricesProvider'
import { ModeloClient } from '../../src/integration/modeloClient'
import type { PreciosSIAP } from '../../src/integration/modeloTypes'

// Real SIAP rows for Guadalupe Victoria corn 2024, copied from the committed dataset
// (Modelo/datasets/precios_siap_durango.json). The two modalities differ by ~3,775x, which is
// exactly the kind of spread the provider must report rather than smooth away.
const CORN_2024: PreciosSIAP = {
  fuente: 'SIAP Cierre agrícola municipal (Durango)',
  version: 'siap-2025-1',
  cultivo_id: 'maiz_grano',
  municipio: 'Guadalupe Victoria',
  anio_ultimo: 2024,
  registros: [
    {
      anio: 2024, ciclo: 'Primavera-Verano', modalidad: 'Riego',
      precio_mxn_t: 7097.78, rendimiento_t_ha: 5.1, volumen_t: 3682.2,
      superficie_cosechada_ha: 722,
    },
    {
      anio: 2024, ciclo: 'Primavera-Verano', modalidad: 'Temporal',
      precio_mxn_t: 1.88, rendimiento_t_ha: 0.88, volumen_t: 684.64,
      superficie_cosechada_ha: 778,
    },
  ],
  advertencias: [],
}

function fakeClient(response: PreciosSIAP | PreciosSIAP[]): { client: ModeloClient; calls: () => number } {
  let count = 0
  const client = new ModeloClient({
    baseUrl: 'http://modelo.test',
    fetchImpl: (async () => {
      const body = Array.isArray(response) ? response[count] : response
      count += 1
      return new Response(JSON.stringify(body), { status: 200 })
    }) as unknown as typeof fetch,
  })
  return { client, calls: () => count }
}

describe('ModeloPricesProvider', () => {
  it('reports the real SIAP annual price as a volume-weighted municipal average in MXN/kg', async () => {
    const { client } = fakeClient(CORN_2024)
    const provider = new ModeloPricesProvider(client)

    const snapshot = await provider.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-15', 'irrigated')

    const expectedPerTon = (7097.78 * 3682.2 + 1.88 * 684.64) / (3682.2 + 684.64)
    expect(snapshot.ruralAvgPriceKg).toBeCloseTo(expectedPerTon / 1000, 6)
    expect(snapshot.provenance).toMatchObject({
      source: 'SIAP Cierre agrícola municipal (Durango)',
      version: 'siap-2025-1',
      // SIAP is annual: the evidence period is the dataset year's close, never today.
      asOf: '2024-12-31',
      kind: 'historical',
      origin: 'real',
    })
  })

  it('prefers the plot modality for yield and falls back to the mixed average with a gap', async () => {
    const irrigated = new ModeloPricesProvider(fakeClient(CORN_2024).client)
    const rainfed = new ModeloPricesProvider(fakeClient(CORN_2024).client)

    const irrigatedSnapshot = await irrigated.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-15', 'irrigated')
    const rainfedSnapshot = await rainfed.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-15', 'rainfed')

    expect(irrigatedSnapshot.yieldTonHa).toBeCloseTo(5.1, 4)
    expect(rainfedSnapshot.yieldTonHa).toBeCloseTo(0.88, 4)
  })

  it('leaves wholesale and guaranteed prices null with an explicit gap instead of deriving them', async () => {
    const { client } = fakeClient(CORN_2024)
    const provider = new ModeloPricesProvider(client)

    const snapshot = await provider.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-15', 'irrigated')

    expect(snapshot.wholesalePriceKg).toBeNull()
    expect(snapshot.guaranteedPriceTon).toBeNull()
    expect(snapshot.infoGaps.join(' ')).toMatch(/Wholesale price \(SNIIM\) is not connected/)
    expect(snapshot.infoGaps.join(' ')).toMatch(/Guaranteed price \(DOF\) is not available/)
  })

  it('flags the very wide real spread across cycles/modalities instead of silently correcting it', async () => {
    const { client } = fakeClient(CORN_2024)
    const provider = new ModeloPricesProvider(client)

    const snapshot = await provider.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-15', 'irrigated')

    expect(snapshot.infoGaps.join(' ')).toMatch(/spread across cycles\/modalities/)
    expect(snapshot.infoGaps.join(' ')).toMatch(/volume-weighted municipal average/)
  })

  it('returns an all-null snapshot with a reason when Modelo has no SIAP rows', async () => {
    const empty: PreciosSIAP = {
      ...CORN_2024,
      anio_ultimo: null,
      registros: [],
      advertencias: ["No SIAP record for 'maiz_grano' in 'Nowhere'."],
    }
    const provider = new ModeloPricesProvider(fakeClient(empty).client)

    const snapshot = await provider.getSnapshot('corn', 'Nowhere', '2026-11-15')

    expect(snapshot).toMatchObject({
      ruralAvgPriceKg: null, wholesalePriceKg: null, guaranteedPriceTon: null,
      yieldTonHa: null, provenance: null,
    })
    expect(snapshot.infoGaps.join(' ')).toMatch(/No SIAP record/)
  })

  it('returns an all-null snapshot for a crop with no Modelo crosswalk, without calling Modelo', async () => {
    const { client, calls } = fakeClient(CORN_2024)
    const provider = new ModeloPricesProvider(client)

    const snapshot = await provider.getSnapshot('unknown-crop', 'Guadalupe Victoria', '2026-11-15')

    expect(snapshot.ruralAvgPriceKg).toBeNull()
    expect(snapshot.infoGaps.join(' ')).toMatch(/No SIAP crop mapping/)
    expect(calls()).toBe(0)
  })

  it('builds one real history point per year and reuses a single Modelo request', async () => {
    const threeYears: PreciosSIAP = {
      ...CORN_2024,
      anio_ultimo: 2025,
      registros: [
        ...CORN_2024.registros,
        { anio: 2025, ciclo: 'Primavera-Verano', modalidad: 'Temporal',
          precio_mxn_t: 2424.24, rendimiento_t_ha: 1.06, volumen_t: 1473.09,
          superficie_cosechada_ha: 1385 },
        { anio: 2023, ciclo: 'Primavera-Verano', modalidad: 'Temporal',
          precio_mxn_t: 3000, rendimiento_t_ha: 1, volumen_t: 1000,
          superficie_cosechada_ha: 1000 },
      ],
    }
    const { client, calls } = fakeClient(threeYears)
    const provider = new ModeloPricesProvider(client)

    const history = await provider.getHistory('corn', 'Guadalupe Victoria')
    await provider.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-15', 'rainfed')

    expect(history.map((point) => point.year)).toEqual([2023, 2024, 2025])
    expect(history[2].priceTon).toBeCloseTo(2424.24, 2)
    // getSnapshot + getHistory share one upstream call for the same crop/municipality.
    expect(calls()).toBe(1)
  })

  it('uses the latest SIAP year at or before the reference date, never a future year', async () => {
    const withFuture: PreciosSIAP = {
      ...CORN_2024,
      anio_ultimo: 2025,
      registros: [
        ...CORN_2024.registros,
        { anio: 2025, ciclo: 'Primavera-Verano', modalidad: 'Temporal',
          precio_mxn_t: 2424.24, rendimiento_t_ha: 1.06, volumen_t: 1473.09,
          superficie_cosechada_ha: 1385 },
      ],
    }
    const provider = new ModeloPricesProvider(fakeClient(withFuture).client)

    const snapshot = await provider.getSnapshot('corn', 'Guadalupe Victoria', '2024-06-01')

    expect(snapshot.provenance?.asOf).toBe('2024-12-31')
  })
})
