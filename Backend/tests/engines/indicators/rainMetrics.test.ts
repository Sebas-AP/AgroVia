import { describe, it, expect } from 'vitest'
import { computeRainMetrics } from '../../../src/engines/indicators/rainMetrics'

describe('computeRainMetrics', () => {
  it('counts extreme rain days using the historical P95, not a fixed threshold', () => {
    const days = [
      { date: '2026-01-01', rainMm: 50 },
      { date: '2026-01-02', rainMm: 10 },
    ]
    expect(computeRainMetrics(days, 40).extremeRainDays).toBe(1)
    expect(computeRainMetrics(days, 60).extremeRainDays).toBe(0)
  })

  it('counts the longest run of consecutive sub-1mm days as the max dry spell', () => {
    const days = [
      { date: '2026-01-01', rainMm: 0.2 },
      { date: '2026-01-02', rainMm: 0.5 },
      { date: '2026-01-03', rainMm: 5 },
      { date: '2026-01-04', rainMm: 0.1 },
    ]
    expect(computeRainMetrics(days, 100).maxDrySpellDays).toBe(2)
  })

  it('sums rainAccumMm and counts rainyDays (>0mm)', () => {
    const days = [
      { date: '2026-01-01', rainMm: 0 },
      { date: '2026-01-02', rainMm: 5 },
      { date: '2026-01-03', rainMm: 3 },
    ]
    const result = computeRainMetrics(days, 100)
    expect(result.rainAccumMm).toBe(8)
    expect(result.rainyDays).toBe(2)
  })
})
