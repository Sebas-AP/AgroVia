import { describe, it, expect } from 'vitest'
import { computeSoilTemperatureAverages } from '../../../src/engines/indicators/soilTemperature'

describe('computeSoilTemperatureAverages', () => {
  it('averages the last 7 and last 10 days separately', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      soilTempC: i + 1,
    }))
    const result = computeSoilTemperatureAverages(days)
    expect(result.avg7d).toBe((4 + 5 + 6 + 7 + 8 + 9 + 10) / 7)
    expect(result.avg10d).toBe((1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10) / 10)
  })

  it('returns null for a window with no data', () => {
    expect(computeSoilTemperatureAverages([])).toEqual({ avg7d: null, avg10d: null })
  })

  it('skips a missing day inside the window instead of treating it as zero', () => {
    const days = [
      { date: '2026-01-01', soilTempC: 10 },
      { date: '2026-01-02', soilTempC: null },
      { date: '2026-01-03', soilTempC: 20 },
    ]
    expect(computeSoilTemperatureAverages(days)).toEqual({ avg7d: 15, avg10d: 15 })
  })

  it('returns null for a window where every day is missing', () => {
    const days = Array.from({ length: 3 }, (_, i) => ({
      date: `2026-01-0${i + 1}`, soilTempC: null,
    }))
    expect(computeSoilTemperatureAverages(days)).toEqual({ avg7d: null, avg10d: null })
  })
})
