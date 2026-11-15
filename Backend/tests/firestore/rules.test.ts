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

  it('blocks the owner from writing provenance fields on their own plot\'s static profile', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-1').firestore()
    await assertFails(ownerDb.doc('plots/plot-1/static/profile').set({ slopeDegrees: 5, source: 'fake' }))
  })

  it('blocks the owner from writing their own plot\'s indicators', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-1').firestore()
    await assertFails(ownerDb.doc('plots/plot-1/indicators/2026-01').set({ rainAccumMm: 999 }))
  })

  it('blocks the owner from reassigning ownerUid on update', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-1').firestore()
    await assertFails(ownerDb.doc('plots/plot-1').update({ ownerUid: 'owner-2' }))
  })

  it('blocks a client from writing a strategy', async () => {
    const db = testEnv.authenticatedContext('owner-1').firestore()
    await assertFails(db.doc('strategies/strategy-1').set({ plotId: 'plot-1', id: 'current' }))
  })

  it('still lets the owner read and write their own seasons and business records', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-1').firestore()
    await assertSucceeds(ownerDb.doc('plots/plot-1/seasons/2025').set({ year: 2025, crop: 'corn' }))
    await assertSucceeds(ownerDb.doc('plots/plot-1/business/current').set({ crop: 'corn', area: 2 }))
  })
})
