import { describe, it, expect } from 'vitest'
import { PowerSoilMoistureProvider } from '../../src/providers/SoilMoistureProvider'
import type { ClimateDay, ClimateProvider } from '../../src/providers/ClimateProvider'
import type { Provenance } from '../../src/types/provenance'

const PROVENANCE: Provenance = {
  source: 'NASA POWER daily point (community AG)',
  product: 'AG community daily',
  version: 'live-1',
  asOf: '2026-07-03',
  latencyDays: 0,
  kind: 'historical',
  origin: 'real',
}

function fakeClimate(days: ClimateDay[]): ClimateProvider & { calls: number } {
  const provider = {
    calls: 0,
    async getDailySeries(): Promise<ClimateDay[]> {
      provider.calls += 1
      return days
    },
  }
  return provider
}

describe('PowerSoilMoistureProvider', () => {
  it('derives surface, root-zone and soil temperature from the real NASA POWER parameters', async () => {
    const climate = fakeClimate([
      { date: '2026-07-01', values: { GWETTOP: 0.31, GWETROOT: 0.42, TS: 21.5 }, provenance: PROVENANCE },
      { date: '2026-07-02', values: { GWETTOP: 0.28, GWETROOT: 0.4, TS: 22.1 }, provenance: PROVENANCE },
    ])
    const provider = new PowerSoilMoistureProvider(climate)

    const series = await provider.getDailySeries('power:24:-104.375', '2026-07-01', '2026-07-02')

    expect(series).toEqual([
      {
        date: '2026-07-01',
        smSurface: 0.31,
        smRootzone: 0.42,
        smRootzonePctl: null,
        soilTempLayer1: 21.5,
        provenance: { ...PROVENANCE, product: 'GWETTOP/GWETROOT/TS daily', kind: 'estimated' },
      },
      {
        date: '2026-07-02',
        smSurface: 0.28,
        smRootzone: 0.4,
        smRootzonePctl: null,
        soilTempLayer1: 22.1,
        provenance: { ...PROVENANCE, product: 'GWETTOP/GWETROOT/TS daily', kind: 'estimated' },
      },
    ])
  })

  it('leaves a missing parameter null instead of zero-filling it', async () => {
    const climate = fakeClimate([
      // GWETROOT and TS are absent on this day — NASA POWER had no usable reading.
      { date: '2026-07-01', values: { GWETTOP: 0.31 }, provenance: PROVENANCE },
    ])
    const provider = new PowerSoilMoistureProvider(climate)

    const [day] = await provider.getDailySeries('power:24:-104.375', '2026-07-01', '2026-07-01')

    expect(day.smSurface).toBe(0.31)
    expect(day.smRootzone).toBeNull()
    expect(day.soilTempLayer1).toBeNull()
    expect(day.smRootzonePctl).toBeNull()
  })

  it('never invents a root-zone percentile', async () => {
    const climate = fakeClimate([
      { date: '2026-07-01', values: { GWETTOP: 0.3, GWETROOT: 0.4, TS: 20 }, provenance: PROVENANCE },
    ])
    const provider = new PowerSoilMoistureProvider(climate)

    const [day] = await provider.getDailySeries('power:24:-104.375', '2026-07-01', '2026-07-01')

    expect(day.smRootzonePctl).toBeNull()
  })

  it('reuses the climate series for the same cell and window instead of calling upstream twice', async () => {
    const climate = fakeClimate([
      { date: '2026-07-01', values: { GWETTOP: 0.3, GWETROOT: 0.4, TS: 20 }, provenance: PROVENANCE },
    ])
    const provider = new PowerSoilMoistureProvider(climate)

    await provider.getDailySeries('power:24:-104.375', '2026-07-01', '2026-07-01')
    await provider.getDailySeries('power:24:-104.375', '2026-07-01', '2026-07-01')
    expect(climate.calls).toBe(1)

    // A different window must not be served from the memoized result.
    await provider.getDailySeries('power:24:-104.375', '2026-07-01', '2026-07-02')
    expect(climate.calls).toBe(2)
  })
})
