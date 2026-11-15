import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAuth, type Auth } from 'firebase-admin/auth'

// Shared by every accessor below: whichever one (Firestore or Auth) a request happens to need
// first must still initialize the default app with the right projectId. A bare `getAuth()` call
// (as plotOwnerAuth used to make directly) auto-creates a default app with NO projectId if
// nothing initialized one yet — which silently breaks ID token verification (wrong `aud`/`iss`)
// on a fresh server's very first authenticated request, before any Firestore call has run.
function ensureAdminApp(): void {
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
  }
}

let db: Firestore | undefined

export function getAdminFirestore(): Firestore {
  if (!db) {
    ensureAdminApp()
    db = getFirestore()
  }
  return db
}

let auth: Auth | undefined

export function getAdminAuth(): Auth {
  if (!auth) {
    ensureAdminApp()
    auth = getAuth()
  }
  return auth
}
