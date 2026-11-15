import { describe, it, expect } from 'vitest'
import {
  assertGrounded, findUnsupportedNumbers,
} from '../../../src/engines/via/verification'
import type { Evidence } from '../../../src/types/provenance'

function evidenceWith(values: string[]): Evidence[] {
  return values.map((value, index) => ({
    label: `Figure ${index}`,
    value,
    unit: 'unit',
    period: '2026-11-01',
    provenance: {
      source: 'test', product: 'test', version: 'v1', asOf: '2026-11-01',
      latencyDays: 0, kind: 'estimated', origin: 'simulated',
    },
  }))
}

describe('findUnsupportedNumbers', () => {
  it('accepts an answer whose figures all appear in evidence', () => {
    const answer = 'Rainfall was 12.4 mm across 3 rainy days.'
    expect(findUnsupportedNumbers(answer, evidenceWith(['12.4', '3']))).toEqual([])
  })

  it('accepts equivalent decimal formatting backed by the same value', () => {
    expect(findUnsupportedNumbers('Margin is 12.40%.', evidenceWith(['12.4']))).toEqual([])
  })

  it('accepts negative coordinates backed by negative evidence', () => {
    expect(findUnsupportedNumbers('Located at 24.4497, -104.1225.', evidenceWith(['24.4497', '-104.1225']))).toEqual([])
  })

  it('rejects a figure that no evidence entry backs', () => {
    const answer = 'Rainfall was 12.4 mm across 4 rainy days.'
    expect(findUnsupportedNumbers(answer, evidenceWith(['12.4', '3']))).toEqual(['4'])
  })

  it('rejects every unsupported figure, not only the first one', () => {
    expect(findUnsupportedNumbers('12.4, 4 and 99', evidenceWith(['12.4']))).toEqual(['4', '99'])
  })

  it('treats an answer with no figures as grounded', () => {
    expect(findUnsupportedNumbers('No data is available.', [])).toEqual([])
  })
})

describe('assertGrounded', () => {
  it('does not throw when every figure is supported', () => {
    expect(() => assertGrounded('Rainfall was 12.4 mm.', evidenceWith(['12.4']))).not.toThrow()
  })

  it('throws naming the unsupported figures', () => {
    expect(() => assertGrounded('Rainfall was 12.4 mm over 4 days.', evidenceWith(['12.4'])))
      .toThrow(/figures with no supporting evidence: 4/)
  })
})
