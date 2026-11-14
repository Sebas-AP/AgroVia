import { describe, it, expect } from 'vitest'
import { SimulatedClimateProvider } from '../../src/providers/ClimateProvider'
import { SimulatedSoilMoistureProvider } from '../../src/providers/SoilMoistureProvider'
import { SimulatedNdviProvider } from '../../src/providers/NdviProvider'
import { SimulatedSoilProvider } from '../../src/providers/SoilProvider'
import { SimulatedPricesProvider } from '../../src/providers/PricesProvider'

describe('SimulatedClimateProvider', () => {
  it('returns one entry per day in range, marked simulated', async () => {
    const provider = new SimulatedClimateProvider()
    const series = await provider.getDailySeries('power:24.25:-104.3125', '2026-01-01', '2026-01-03')
    expect(series).toHaveLength(3)
    expect(series[0].provenance.origin).toBe('simulated')
    expect(Object.keys(series[0].values).sort()).toEqual(
      ['ALLSKY_SFC_SW_DWN', 'GWETPROF', 'GWETROOT', 'GWETTOP', 'PRECTOTCORR', 'RH2M', 'T2M', 'T2M_MAX',
       'T2M_MIN', 'TS', 'WS2M'].sort(),
    )
  })

  it('is deterministic for the same cellId and date range', async () => {
    const provider = new SimulatedClimateProvider()
    const a = await provider.getDailySeries('power:24.25:-104.3125', '2026-01-01', '2026-01-02')
    const b = await provider.getDailySeries('power:24.25:-104.3125', '2026-01-01', '2026-01-02')
    expect(a).toEqual(b)
  })

  it('generates physically plausible values for the semi-arid pilot zone, over many days', async () => {
    const provider = new SimulatedClimateProvider()
    const series = await provider.getDailySeries('power:24.25:-104.3125', '2026-01-01', '2026-03-31')
    for (const day of series) {
      expect(day.values.T2M_MIN).toBeLessThanOrEqual(day.values.T2M)
      expect(day.values.T2M).toBeLessThanOrEqual(day.values.T2M_MAX)
      expect(day.values.T2M).toBeGreaterThanOrEqual(-10)
      expect(day.values.T2M).toBeLessThanOrEqual(45)
      expect(day.values.PRECTOTCORR).toBeGreaterThanOrEqual(0)
      expect(day.values.PRECTOTCORR).toBeLessThanOrEqual(50)
      expect(day.values.RH2M).toBeGreaterThanOrEqual(0)
      expect(day.values.RH2M).toBeLessThanOrEqual(100)
    }
  })
})

describe('SimulatedSoilMoistureProvider', () => {
  it('returns one entry per day in range, marked simulated', async () => {
    const provider = new SimulatedSoilMoistureProvider()
    const series = await provider.getDailySeries('smap:24.24:-104.16', '2026-01-01', '2026-01-02')
    expect(series).toHaveLength(2)
    expect(series[0].provenance.origin).toBe('simulated')
    expect(series[0]).toHaveProperty('smSurface')
    expect(series[0]).toHaveProperty('smRootzone')
    expect(series[0]).toHaveProperty('soilTempLayer1')
  })
})

describe('SimulatedNdviProvider', () => {
  it('returns one entry per day in range, marked simulated', async () => {
    const provider = new SimulatedNdviProvider()
    const series = await provider.getSeries('modis:24.2475:-104.12275', '2026-01-01', '2026-01-02')
    expect(series).toHaveLength(2)
    expect(series[0].provenance.origin).toBe('simulated')
    expect(series[0]).toHaveProperty('ndvi')
    expect(series[0]).toHaveProperty('qualityOk')
  })
})

describe('SimulatedSoilProvider', () => {
  it('returns a static profile marked simulated', async () => {
    const provider = new SimulatedSoilProvider()
    const profile = await provider.getStaticProfile(24.4497, -104.1225)
    expect(profile.provenance.origin).toBe('simulated')
    expect(profile).toHaveProperty('slopeDegrees')
    expect(profile).toHaveProperty('sandPct')
    expect(profile).toHaveProperty('waterRetentionMm')
  })

  it('is deterministic for the same coordinate', async () => {
    const provider = new SimulatedSoilProvider()
    const a = await provider.getStaticProfile(24.4497, -104.1225)
    const b = await provider.getStaticProfile(24.4497, -104.1225)
    expect(a).toEqual(b)
  })
})

describe('SimulatedPricesProvider', () => {
  it('returns a price snapshot marked simulated', async () => {
    const provider = new SimulatedPricesProvider()
    const snapshot = await provider.getSnapshot('corn', 'Guadalupe Victoria', '2026-11-01')
    expect(snapshot.provenance.origin).toBe('simulated')
    expect(snapshot).toHaveProperty('ruralAvgPriceKg')
    expect(snapshot).toHaveProperty('wholesalePriceKg')
    expect(snapshot).toHaveProperty('yieldTonHa')
  })
})
