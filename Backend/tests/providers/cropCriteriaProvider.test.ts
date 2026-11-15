import { describe, it, expect } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { CropCriteriaProvider } from '../../src/providers/CropCriteriaProvider'
import { seedCropCatalog } from '../../src/seed/cropCatalog.seed'

describe('CropCriteriaProvider', () => {
  it('returns the catalog entry for a seeded crop', async () => {
    const testEnv = await initializeTestEnvironment({ projectId: 'agrovia-criteria-test' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as FirebaseFirestore.Firestore
      await seedCropCatalog(db)
      const provider = new CropCriteriaProvider(db)
      const entry = await provider.getCriteria('corn')
      expect(entry?.name).toBe('Grain corn')
    })
    await testEnv.cleanup()
  })

  it('returns null for a crop missing from the catalog', async () => {
    const testEnv = await initializeTestEnvironment({ projectId: 'agrovia-criteria-test-2' })
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as FirebaseFirestore.Firestore
      const provider = new CropCriteriaProvider(db)
      const entry = await provider.getCriteria('unknown-crop')
      expect(entry).toBeNull()
    })
    await testEnv.cleanup()
  })
})
