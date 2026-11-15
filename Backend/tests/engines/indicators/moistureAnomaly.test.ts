import { describe, it, expect } from 'vitest'
import { computeMoistureAnomaly } from '../../../src/engines/indicators/moistureAnomaly'

describe('computeMoistureAnomaly', () => {
  it('averages the available smRootzonePctl values', () => {
    const days = [
      { date: '2026-01-01', smRootzonePctl: 40 },
      { date: '2026-01-02', smRootzonePctl: 60 },
    ]
    expect(computeMoistureAnomaly(days)).toBe(50)
  })

  it('returns null, never a fabricated number, when every entry is null', () => {
    const days = [
      { date: '2026-01-01', smRootzonePctl: null },
      { date: '2026-01-02', smRootzonePctl: null },
    ]
    expect(computeMoistureAnomaly(days)).toBeNull()
  })
})
