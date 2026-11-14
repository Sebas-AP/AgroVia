import { describe, it, expect } from 'vitest'
import { imputeGaps } from '../../../src/engines/indicators/imputation'

describe('imputeGaps', () => {
  it('fills a gap of up to maxGapDays by linear interpolation and marks it imputed', () => {
    const days = [
      { date: '2026-01-01', value: 10 }, { date: '2026-01-02', value: null },
      { date: '2026-01-03', value: 20 },
    ]
    const result = imputeGaps(days, 3)
    expect(result[1]).toEqual({ date: '2026-01-02', value: 15, imputed: true })
  })

  it('leaves a gap longer than maxGapDays as null, not imputed', () => {
    const days = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: null }, { date: '2026-01-03', value: null },
      { date: '2026-01-04', value: null }, { date: '2026-01-05', value: null },
      { date: '2026-01-06', value: 20 },
    ]
    const result = imputeGaps(days, 3)
    expect(result.slice(1, 5).every((d) => d.value === null && !d.imputed)).toBe(true)
  })
})
