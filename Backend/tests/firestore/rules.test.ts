import { describe, it, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'

let testEnv: import('@firebase/rules-unit-testing').RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'agrovia-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => testEnv.cleanup())

describe('plots security rules', () => {
  it('lets the owner read their own plot', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-1').firestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      ctx.firestore().doc('plots/plot-1').set({ ownerUid: 'owner-1' }))
    await assertSucceeds(ownerDb.doc('plots/plot-1').get())
  })

  it('blocks a different authenticated user from reading the plot', async () => {
    const otherDb = testEnv.authenticatedContext('owner-2').firestore()
    await assertFails(otherDb.doc('plots/plot-1').get())
  })

  it('blocks a client from writing cropCatalog', async () => {
    const db = testEnv.authenticatedContext('owner-1').firestore()
    await assertFails(db.doc('cropCatalog/corn').set({ name: 'Corn' }))
  })
})
