import { describe, it, expect } from 'vitest'
import { computeIndicators } from '../../../src/engines/indicators'
import type { Provenance } from '../../../src/types/provenance'

const provenance: Provenance = {
  source: 'test', product: 'test', version: 'v1', asOf: '2026-01-31',
  latencyDays: 0, kind: 'historical', origin: 'simulated',
}

function buildInput() {
  return {
    plotId: 'demo-guadalupe-victoria',
    month: '2026-01',
    cropBaseTempC: 10,
    climate: [
      { date: '2026-01-01', values: { PRECTOTCORR: 5, T2M: 20, T2M_MAX: 25, T2M_MIN: 15, RH2M: 50, GWETTOP: 0.3, GWETROOT: 0.3, GWETPROF: 0.3, TS: 20, ALLSKY_SFC_SW_DWN: 200, WS2M: 2 }, provenance },
      // Day 2's precipitation reading is missing (null) — it must stay a gap, never imputed or zeroed.
      { date: '2026-01-02', values: { PRECTOTCORR: null, T2M: 21, T2M_MAX: 26, T2M_MIN: 16, RH2M: 52, GWETTOP: 0.3, GWETROOT: 0.3, GWETPROF: 0.3, TS: 21, ALLSKY_SFC_SW_DWN: 200, WS2M: 2 }, provenance },
      { date: '2026-01-03', values: { PRECTOTCORR: 10, T2M: 22, T2M_MAX: 27, T2M_MIN: 17, RH2M: 54, GWETTOP: 0.3, GWETROOT: 0.3, GWETPROF: 0.3, TS: 22, ALLSKY_SFC_SW_DWN: 200, WS2M: 2 }, provenance },
    ],
    soilMoisture: [
      { date: '2026-01-01', smSurface: 0.2, smRootzone: 0.25, smRootzonePctl: 40, soilTempLayer1: 18, provenance },
      { date: '2026-01-02', smSurface: 0.2, smRootzone: 0.25, smRootzonePctl: 45, soilTempLayer1: 19, provenance },
      { date: '2026-01-03', smSurface: 0.2, smRootzone: 0.25, smRootzonePctl: 50, soilTempLayer1: 20, provenance },
    ],
    ndvi: [
      { date: '2026-01-01', ndvi: 0.5, evi: 0.4, qualityOk: true, provenance },
      { date: '2026-01-02', ndvi: 0.5, evi: 0.4, qualityOk: true, provenance },
      { date: '2026-01-03', ndvi: 0.5, evi: 0.4, qualityOk: true, provenance },
    ],
  }
}

describe('computeIndicators', () => {
  it('never imputes or zero-fills a missing precipitation reading', () => {
    const result = computeIndicators(buildInput())
    // Only day 1 (5mm) and day 3 (10mm) count; day 2's missing reading contributes nothing.
    expect(result.rainAccumMm).toBe(15)
  })

  it('drops a missing precipitation day entirely rather than zero-filling it (sum alone cannot tell these apart)', () => {
    // Day 1 and day 3 both have rainMm < 1 (dry); day 2 is missing. If day 2 were zero-filled
    // (0mm, also < 1), the dry spell would run all 3 days. Dropping it instead leaves only 2
    // adjacent entries in the filtered array, so the spell can only be 2 days long.
    const input = buildInput()
    input.climate[0].values.PRECTOTCORR = 0.2
    input.climate[2].values.PRECTOTCORR = 0.2
    const result = computeIndicators(input)
    expect(result.maxDrySpellDays).toBe(2)
  })

  it('stamps engineVersion and a non-empty sources array that preserves version/origin, not just source/product', () => {
    const result = computeIndicators(buildInput())
    expect(result.engineVersion).toBeTruthy()
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.sources[0]).toMatch(/v1/)
    expect(result.sources[0]).toMatch(/simulated/)
  })

  it('reports airTempAvg as null, never zero, when no climate data covers the target month', () => {
    const input = buildInput()
    input.month = '2026-02' // no climate/ndvi entries fall in this month
    const result = computeIndicators(input)
    expect(result.airTempAvg).toBeNull()
    expect(result.airTempMax).toBeNull()
    expect(result.airTempMin).toBeNull()
    expect(result.relativeHumidityAvg).toBeNull()
  })

  it('keeps the last reported soil moisture when the final day has no reading', () => {
    const input = buildInput()
    input.soilMoisture[2].smSurface = null
    input.soilMoisture[2].smRootzone = null
    const result = computeIndicators(input)
    // Days 1 and 2 both reported 0.2/0.25; the missing day 3 must not erase that observation.
    expect(result.surfaceSoilMoisture).toBe(0.2)
    expect(result.rootZoneSoilMoisture).toBe(0.25)
  })

  it('reports null soil moisture when no day in the window reported a value', () => {
    const input = buildInput()
    for (const day of input.soilMoisture) {
      day.smSurface = null
      day.smRootzone = null
    }
    const result = computeIndicators(input)
    expect(result.surfaceSoilMoisture).toBeNull()
    expect(result.rootZoneSoilMoisture).toBeNull()
  })

  it('reports null moisture anomaly when the percentile series is unavailable', () => {
    const input = buildInput()
    for (const day of input.soilMoisture) {
      day.smRootzonePctl = null
    }
    const result = computeIndicators(input)
    expect(result.moistureAnomalyPctl).toBeNull()
  })
})
