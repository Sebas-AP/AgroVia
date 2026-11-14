import { describe, it, expect } from 'vitest'
import { resampleToMonthly } from '../../../src/engines/indicators/harmonize'

describe('resampleToMonthly', () => {
  it('groups rows by the YYYY-MM prefix of their date and aggregates each group', () => {
    const daily = [
      { date: '2026-01-05', value: 10 },
      { date: '2026-01-20', value: 20 },
      { date: '2026-02-02', value: 100 },
    ]
    const result = resampleToMonthly(daily, (rows) => ({
      value: rows.reduce((sum, r) => sum + r.value, 0),
    }))
    expect(result).toEqual([
      { month: '2026-01', data: { value: 30 } },
      { month: '2026-02', data: { value: 100 } },
    ])
  })
})
