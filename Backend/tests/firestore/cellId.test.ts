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
})
