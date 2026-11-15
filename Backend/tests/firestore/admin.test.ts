import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getApps, deleteApp } from 'firebase-admin/app'

// Regression test for a real cold-start bug: plotOwnerAuth used to call the bare
// firebase-admin/auth `getAuth()` directly. On a fresh server process, if an incoming request's
// auth check is the very first firebase-admin call (true for the server's first hit, and
// invisible in the normal test suite since some earlier test always primes Firestore first in
// the same worker), that auto-creates a default app with NO projectId — silently breaking ID
// token verification (wrong aud/iss) until something else happens to call getAdminFirestore().
// getAdminAuth()/getAdminFirestore() must always initialize (or reuse) the SAME, correctly
// configured app, regardless of which one a request touches first.
describe('firestore/admin: shared app initialization', () => {
  beforeEach(async () => {
    for (const app of getApps()) {
      await deleteApp(app)
    }
    // admin.ts caches its Firestore/Auth instances in module-level `let` bindings; without
    // resetting the module registry, a second dynamic import() in this file would just return
    // the same already-initialized singleton and never actually re-exercise cold-start ordering.
    vi.resetModules()
  })

  it('getAdminAuth() called before any Firestore call still uses the configured projectId', async () => {
    const { getAdminAuth } = await import('../../src/firestore/admin')
    getAdminAuth()
    expect(getApps()).toHaveLength(1)
    expect(getApps()[0]?.options.projectId).toBe(process.env.FIREBASE_PROJECT_ID)
  })

  it('getAdminFirestore() after getAdminAuth() reuses the same app, not a second one', async () => {
    const { getAdminAuth, getAdminFirestore } = await import('../../src/firestore/admin')
    getAdminAuth()
    getAdminFirestore()
    expect(getApps()).toHaveLength(1)
  })
})
