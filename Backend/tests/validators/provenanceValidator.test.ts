import { describe, it, expect } from 'vitest'
import { validateProvenance } from '../../src/validators/provenanceValidator'

describe('validateProvenance', () => {
  it('accepts a value with all five required fields', () => {
    const result = validateProvenance({
      source: 'NASA POWER', product: 'AG community daily', version: 'v9',
      asOf: '2026-11-01', latencyDays: 2, kind: 'historical', origin: 'simulated',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a value missing latencyDays', () => {
    const result = validateProvenance({
      source: 'NASA POWER', product: 'AG community daily', version: 'v9',
      asOf: '2026-11-01', kind: 'historical', origin: 'simulated',
    })
    expect(result.ok).toBe(false)
  })
})
