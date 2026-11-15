// Real Backend client: Firebase custom-token sign-in (as the fixed demo-owner uid — there is no
// real "create a plot" flow yet, see INTEGRACION.md §5) plus an authenticated fetch helper.
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, type User } from 'firebase/auth'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string
export const DEMO_PLOT_ID = 'demo-guadalupe-victoria'

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
})
const auth = getAuth(app)

let signIn: Promise<User> | null = null
function ensureSignedIn(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  if (!signIn) {
    signIn = fetch(`${BACKEND_URL}/auth/demo-token`, { method: 'POST' })
      .then((r) => r.json())
      .then(({ token }) => signInWithCustomToken(auth, token))
      .then((cred) => cred.user)
      .catch((e) => { signIn = null; throw e })
  }
  return signIn
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  const user = await ensureSignedIn()
  const idToken = await user.getIdToken()
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`El Backend respondió ${res.status}`)
  return res.json()
}

export interface RealSnapshot {
  ndviAvg: number | null
  airTempAvg: number | null
  relativeHumidityAvg: number | null
  ndviProvenance: { origin: string } | null
}
// Una sola llamada real por carga de la app (clima + NDVI actuales de la parcela demo), para
// mostrar el valor real donde la pantalla ya pedía un solo número — nunca para fabricar los 12
// puntos de una gráfica histórica que el Backend no tiene (ver services/index.ts).
let snapshot: Promise<RealSnapshot | null> | null = null
export function getRealSnapshot(): Promise<RealSnapshot | null> {
  if (!snapshot) snapshot = backendFetch(`/plots/${DEMO_PLOT_ID}/indicators`).catch(() => null)
  return snapshot
}
