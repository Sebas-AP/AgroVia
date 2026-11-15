import { describe, it, expect } from 'vitest'
import { isBareSoil } from '../../../src/engines/indicators/bareSoil'

describe('isBareSoil', () => {
  it('returns true when NDVI is below the cover threshold and quality is ok', () => {
    expect(isBareSoil(0.1, true, 0.2)).toBe(true)
  })

  it('returns false when NDVI is above the cover threshold and quality is ok', () => {
    expect(isBareSoil(0.5, true, 0.2)).toBe(false)
  })

  it('returns null when the quality band is not ok, regardless of NDVI', () => {
    expect(isBareSoil(0.1, false, 0.2)).toBeNull()
  })
})
