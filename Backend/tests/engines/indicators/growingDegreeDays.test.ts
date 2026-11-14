import { describe, it, expect } from 'vitest'
import { computeGrowingDegreeDaysAccum } from '../../../src/engines/indicators/growingDegreeDays'

describe('computeGrowingDegreeDaysAccum', () => {
  it('accumulates temperature above the base temperature', () => {
    const days = [
      { date: '2026-01-01', tempAvgC: 15 },
      { date: '2026-01-02', tempAvgC: 8 },
      { date: '2026-01-03', tempAvgC: 20 },
    ]
    expect(computeGrowingDegreeDaysAccum(days, 10)).toBe((15 - 10) + 0 + (20 - 10))
  })

  it('never accumulates a negative amount for a day below the base temperature', () => {
    const days = [{ date: '2026-01-01', tempAvgC: 2 }]
    expect(computeGrowingDegreeDaysAccum(days, 10)).toBe(0)
  })
})
