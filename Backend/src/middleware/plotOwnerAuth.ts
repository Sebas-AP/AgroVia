import type { Request, Response, NextFunction } from 'express'
import { getAdminFirestore, getAdminAuth } from '../firestore/admin'
import { COLLECTIONS } from '../firestore/collections'
import { unauthorized, forbidden } from './errorHandler'
import type { PlotSnapshot } from '../types/firestoreDocs'

// Every /plots/:id/* route used the Admin SDK directly, which always bypasses the owner-only
// Firestore security rules below — so any caller who knew or guessed a plot id could read or
// write it over HTTP (see Backend/src/app.ts's former comment and INTEGRACION.md defect (a)).
// This verifies the caller's Firebase ID token and checks it against the plot's ownerUid before
// any route handler runs.
function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization') ?? ''
  const match = /^Bearer (.+)$/.exec(header)
  return match ? match[1] : null
}

export async function plotOwnerAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req)
  if (!token) {
    next(unauthorized('Missing bearer token.'))
    return
  }

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    next(unauthorized('Invalid or expired token.'))
    return
  }

  const plotId = req.params.id
  const doc = await getAdminFirestore().collection(COLLECTIONS.plots).doc(plotId).get()
  // An unknown plot id is left to the route's own getPlotOrThrow (404) — returning 403 here
  // would leak which plot ids exist to an unauthenticated guess.
  if (doc.exists && (doc.data() as PlotSnapshot).ownerUid !== uid) {
    next(forbidden('You do not own this plot.'))
    return
  }

  next()
}
