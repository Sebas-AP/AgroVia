import { describe, it, expect } from 'vitest'
import { toParcelaInput, fromParcelaInput } from '../../src/integration/modeloMapper'
import type { PlotSnapshot } from '../../src/types/firestoreDocs'

const PLOT: PlotSnapshot = {
  ownerUid: 'demo-owner', name: 'Guadalupe Victoria demo plot', center: { lat: 24.4497, lon: -104.1225 },
  areaHa: 9.6, mode: 'rainfed', currentCrop: 'corn', declaredSoilType: 'franco', elevationM: 2000,
  country: 'Mexico', state: 'Durango', municipality: 'Guadalupe Victoria', locality: 'Guadalupe Victoria',
  powerCellId: 'power:24.0:-104.375', gpmCellId: 'gpm:24.4:-104.2', smapCellId: 'smap:24.4:-104.16',
  priorities: { water: 3, income: 3, forage: 2, nitrogen: 2, erosion: 2, organicMatter: 2, market: 2 },
  constraints: { waterAvailability: 'low', equipment: [] }, origin: 'demo',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  terrainType: 'plano', growthStage: 'cosecha',
}

const EVENTS = [
  { date: '2025-06-01', type: 'irrigation' },
  { date: '2026-06-15', type: 'sowing' },
  { date: '2025-06-10', type: 'sowing' },
]

describe('toParcelaInput', () => {
  it('maps every field per the documented table', () => {
    const parcela = toParcelaInput({ plot: PLOT, events: EVENTS })
    expect(parcela).toEqual({
      latitud: 24.4497,
      longitud: -104.1225,
      superficie_hectareas: 9.6,
      tipo_terreno: 'plano',
      tipo_suelo: 'franco',
      disponibilidad_agua: 'low',
      sistema_riego: 'temporal',
      cultivo_actual: 'corn',
      fecha_siembra: '2026-06-15',
      etapa_crecimiento: 'cosecha',
    })
  })

  it('maps irrigated mode to sistema_riego "riego"', () => {
    const parcela = toParcelaInput({ plot: { ...PLOT, mode: 'irrigated' }, events: EVENTS })
    expect(parcela.sistema_riego).toBe('riego')
  })

  it('picks the most recent sowing event when there are several', () => {
    const parcela = toParcelaInput({ plot: PLOT, events: EVENTS })
    expect(parcela.fecha_siembra).toBe('2026-06-15')
  })

  it('throws naming every missing field, not just the first one', () => {
    const incomplete: PlotSnapshot = { ...PLOT, terrainType: undefined, growthStage: undefined }
    expect(() => toParcelaInput({ plot: incomplete, events: [] })).toThrow(
      /plot\.terrainType.*plot\.growthStage.*sowing event/s,
    )
  })

  it('throws when there is no sowing event, without inventing a sowing date', () => {
    expect(() => toParcelaInput({ plot: PLOT, events: [] })).toThrow(/sowing event/)
  })

  it('uses the polygon centroid instead of the declared center when a valid boundary exists', () => {
    const polygonCenter = { lat: 24.451, lon: -104.12 }
    const polygon = [
      { lat: polygonCenter.lat - 0.001, lon: polygonCenter.lon - 0.001 },
      { lat: polygonCenter.lat - 0.001, lon: polygonCenter.lon + 0.001 },
      { lat: polygonCenter.lat + 0.001, lon: polygonCenter.lon + 0.001 },
      { lat: polygonCenter.lat + 0.001, lon: polygonCenter.lon - 0.001 },
    ]

    const parcela = toParcelaInput({ plot: { ...PLOT, polygon }, events: EVENTS })

    expect(parcela.latitud).toBeCloseTo(polygonCenter.lat, 4)
    expect(parcela.longitud).toBeCloseTo(polygonCenter.lon, 4)
    expect(parcela.superficie_hectareas).toBe(PLOT.areaHa)
  })

  it('falls back to the declared center when the stored polygon is invalid', () => {
    const parcela = toParcelaInput({ plot: { ...PLOT, polygon: [{ lat: 24.45, lon: -104.12 }] }, events: EVENTS })
    expect(parcela.latitud).toBe(PLOT.center.lat)
    expect(parcela.longitud).toBe(PLOT.center.lon)
  })
})

describe('fromParcelaInput', () => {
  it('maps every field back, inverting toParcelaInput', () => {
    const parcela = toParcelaInput({ plot: PLOT, events: EVENTS })
    const back = fromParcelaInput(parcela)
    expect(back).toEqual({
      center: { lat: 24.4497, lon: -104.1225 },
      areaHa: 9.6,
      terrainType: 'plano',
      declaredSoilType: 'franco',
      constraints: { waterAvailability: 'low', equipment: [] },
      mode: 'rainfed',
      currentCrop: 'corn',
      growthStage: 'cosecha',
      fechaSiembra: '2026-06-15',
    })
  })

  it('rejects an unknown sistema_riego value rather than guessing a mode', () => {
    const parcela = toParcelaInput({ plot: PLOT, events: EVENTS })
    expect(() => fromParcelaInput({ ...parcela, sistema_riego: 'goteo' })).toThrow(/Unknown sistema_riego/)
  })
})
