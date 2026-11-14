import express from 'express'
import { healthRouter } from './routes/health'
import { plotsRouter } from './routes/plots'
import { catalogRouter } from './routes/catalog'
import { pricesRouter } from './routes/prices'
import { internalRouter } from './routes/internal'
import { errorHandler } from './middleware/errorHandler'

// ASSUMPTION / KNOWN GAP: none of these routes check caller identity. The Firestore security
// rules below are owner-only, but every route here uses the Admin SDK, which always bypasses
// them — so right now any caller who knows or guesses a plot id can read or trigger writes for
// it over HTTP. Spec §17 explicitly defers "anonymous vs. email auth" as a team decision; this
// is that same open question surfacing at the API layer, not resolved here. Do not deploy this
// publicly without adding a caller-identity check (e.g. verifying a Firebase ID token) first.
export function createApp(): express.Express {
  const app = express()
  app.use(express.json())
  app.use(healthRouter)
  app.use(plotsRouter)
  app.use(catalogRouter)
  app.use(pricesRouter)
  app.use(internalRouter)
  app.use(errorHandler)
  return app
}
