import { describe, it, expect } from 'vitest'
import { computeWaterBalance } from '../../../src/engines/indicators/waterBalance'

describe('computeWaterBalance', () => {
  it('sums rain minus evapotranspiration over the trailing window, including today', () => {
    const days = [
      { date: '2026-01-01', rainMm: 5, evapotranspirationMm: 2 },
      { date: '2026-01-02', rainMm: 0, evapotranspirationMm: 3 },
      { date: '2026-01-03', rainMm: 10, evapotranspirationMm: 1 },
    ]
    expect(computeWaterBalance(days, 5)).toBe((5 - 2) + (0 - 3) + (10 - 1))
  })

  it('returns null when days is empty', () => {
    expect(computeWaterBalance([], 5)).toBeNull()
  })

  it('only sums the last windowDays entries', () => {
    const days = [
      { date: '2026-01-01', rainMm: 100, evapotranspirationMm: 0 },
      { date: '2026-01-02', rainMm: 1, evapotranspirationMm: 1 },
    ]
    expect(computeWaterBalance(days, 1)).toBe(0)
  })
})
