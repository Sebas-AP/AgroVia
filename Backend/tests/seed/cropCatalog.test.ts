import { describe, it, expect } from 'vitest'
import { CROP_CATALOG_SEED } from '../../src/seed/cropCatalog.seed'

describe('crop catalog seed provenance', () => {
  it('every entry names a source and a reference', () => {
    expect(CROP_CATALOG_SEED.length).toBeGreaterThan(0)
    for (const crop of CROP_CATALOG_SEED) {
      expect(crop.source.trim()).not.toBe('')
      expect(crop.reference.trim()).not.toBe('')
    }
  })

  it('an entry declared documented is tied to a named external source, not an assumption', () => {
    for (const crop of CROP_CATALOG_SEED.filter((c) => c.criterionType === 'documented')) {
      expect(crop.source).not.toMatch(/assum|placeholder|tbd/i)
      expect(crop.reference).not.toMatch(/assum|placeholder|tbd/i)
    }
  })

  it('an assumed entry does not claim a named external source and warns it needs review', () => {
    // criterionType 'assumed' is the catalog's own contract for "not from a named source"; the
    // entry must say so instead of being presented as documented data.
    for (const crop of CROP_CATALOG_SEED.filter((c) => c.criterionType === 'assumed')) {
      expect(crop.source).toMatch(/none found/i)
      expect(crop.reference).toMatch(/review|no .*figure found/i)
    }
  })

  it('ids are unique', () => {
    const ids = CROP_CATALOG_SEED.map((crop) => crop.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
