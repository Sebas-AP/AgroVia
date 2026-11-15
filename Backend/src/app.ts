import express from 'express'
import { healthRouter } from './routes/health'
import { plotsRouter } from './routes/plots'
import { catalogRouter } from './routes/catalog'
import { pricesRouter } from './routes/prices'
import { internalRouter } from './routes/internal'
import { errorHandler } from './middleware/errorHandler'

// /plots/:id/* routes are guarded by plotOwnerAuth (verifies the Firebase ID token and compares
// its uid against the plot's ownerUid), wired in routes/plots.ts — see INTEGRACION.md defect (a).
// /internal/* keeps its service-key check. Works identically for anonymous or email-based auth
// (spec §17's open question), since verifyIdToken returns the same shape of uid either way.
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
