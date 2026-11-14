import { describe, it, expect } from 'vitest'
import { computeCellId } from '../../src/firestore/cellId'

describe('computeCellId', () => {
  it('is deterministic for the same coordinate and product', () => {
    const a = computeCellId(24.4497, -104.1225, 'power')
    const b = computeCellId(24.4497, -104.1225, 'power')
    expect(a).toBe(b)
  })

  it('maps two nearby points inside the same POWER cell to the same id', () => {
    const a = computeCellId(24.4497, -104.1225, 'power')
    const b = computeCellId(24.4510, -104.1230, 'power')
    expect(a).toBe(b)
  })

  it('uses POWER\'s real 0.5deg latitude step, not 0.625deg on both axes', () => {
    // 24.4 and 24.6 fall in the same true 0.5deg latitude band [24.0, 24.5) vs [24.5, 25.0) —
    // wait, these straddle it on purpose: 24.4 is in [24.0, 24.5), 24.6 is in [24.5, 25.0).
    // A correct 0.5deg step must place them in DIFFERENT cells.
    const a = computeCellId(24.4, -104.1225, 'power')
    const b = computeCellId(24.6, -104.1225, 'power')
    expect(a).not.toBe(b)
  })

  it('places two points in the same true 0.5deg latitude band in the same cell', () => {
    const a = computeCellId(24.1, -104.1225, 'power')
    const b = computeCellId(24.45, -104.1225, 'power')
    expect(a).toBe(b)
  })
})
