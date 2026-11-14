import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let db: Firestore | undefined

export function getAdminFirestore(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
    }
    db = getFirestore()
  }
  return db
}
