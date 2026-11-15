import { getAuth } from 'firebase-admin/auth'

// Mints an unsigned (alg "none") ID token in the shape the Firebase Auth Emulator issues.
// firebase-admin's verifyIdToken() checks these claims locally (no fetch of Google's signing
// certs) once FIREBASE_AUTH_EMULATOR_HOST is set (see vitest.config.ts) — but it still always
// runs its revocation check against that emulator when isEmulator is true, which needs the uid
// to actually exist there. mintIdTokenForUid() below creates it first; this is the Auth emulator
// (127.0.0.1:9099), started alongside Firestore, e.g. `firebase emulators:exec --only
// firestore,auth "npm test"` — no real network or credentials involved.
function base64url(value: string): string {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createFakeIdToken(uid: string, projectId = process.env.FIREBASE_PROJECT_ID ?? 'agrovia-test'): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'none', typ: 'JWT' }
  const payload = {
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: uid,
    uid,
    iat: now,
    exp: now + 3600,
  }
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.`
}

export async function mintIdTokenForUid(uid: string): Promise<string> {
  await getAuth().createUser({ uid }).catch((err: unknown) => {
    if ((err as { code?: string }).code !== 'auth/uid-already-exists') throw err
  })
  return createFakeIdToken(uid)
}
