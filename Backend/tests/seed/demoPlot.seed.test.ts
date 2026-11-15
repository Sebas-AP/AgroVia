import { describe, it, expect } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { seedDemoPlot } from '../../src/seed/demoPlot.seed'

describe('seedDemoPlot', () => {
  it('writes a rainfed plot in Guadalupe Victoria with two seasons of history', async () => {
    const testEnv = await initializeTestEnvironment({ projectId: 'agrovia-seed-test' })
    // seedDemoPlot runs over the Admin SDK in production, which always bypasses security
    // rules — withSecurityRulesDisabled is the test-environment equivalent of that bypass.
    // The read-back also needs it: the real deployed rules require an authenticated owner,
    // which this test isn't asserting on.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as FirebaseFirestore.Firestore
      await seedDemoPlot(db)
      const plot = await db.doc('plots/demo-guadalupe-victoria').get()
      expect(plot.data()).toMatchObject({
        center: { lat: 24.4497, lon: -104.1225 }, areaHa: 9.6, mode: 'rainfed', origin: 'demo',
      })
      const seasons = await db.collection('plots/demo-guadalupe-victoria/seasons').get()
      expect(seasons.size).toBe(2)
    })
    await testEnv.cleanup()
  })
})
