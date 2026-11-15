import { initializeApp, cert } from 'firebase-admin/app'
import { createApp } from './app'

// Production has no local emulator to fall back on, so firebase-admin needs real credentials.
// Render's Secret Files aren't available through this deploy path, so the service-account JSON
// travels as one env var instead; this runs before any route calls getAdminFirestore/getAdminAuth
// (firestore/admin.ts), which only initializes a default app when none exists yet.
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) })
}

const port = process.env.PORT ?? 3000

createApp().listen(port, () => {
  console.log(`AGROVÍA backend listening on port ${port}`)
})
