import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // FIREBASE_AUTH_EMULATOR_HOST makes firebase-admin's verifyIdToken() decode+check claims
    // locally instead of fetching Google's signing certs — no Auth emulator process has to be
    // running for that. FIRESTORE_EMULATOR_HOST/FIREBASE_PROJECT_ID still need to be exported by
    // whoever runs the suite (e.g. `firebase emulators:exec --only firestore "npm test"`).
    env: {
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? 'agrovia-test',
    },
    // The Admin SDK's first Firestore/Auth call per worker is slow to establish in some
    // sandboxes (seen locally: ~10-15s cold start against the emulator) — the vitest defaults
    // (5s/10s) flake on that, independent of anything the test itself does.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
