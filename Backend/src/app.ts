import express from 'express'
import { healthRouter } from './routes/health'
import { plotsRouter } from './routes/plots'
import { catalogRouter } from './routes/catalog'
import { pricesRouter } from './routes/prices'
import { internalRouter } from './routes/internal'
import { authRouter } from './routes/auth'
import { errorHandler } from './middleware/errorHandler'

// /plots/:id/* routes are guarded by plotOwnerAuth (verifies the Firebase ID token and compares
// its uid against the plot's ownerUid), wired in routes/plots.ts — see INTEGRACION.md defect (a).
// /internal/* keeps its service-key check. Works identically for anonymous or email-based auth
// (spec §17's open question), since verifyIdToken returns the same shape of uid either way.
export function createApp(): express.Express {
  const app = express()
  app.use(express.json())
  // The Android app's WebView serves pages from https://appassets.androidplatform.net, a
  // different origin than this API — without CORS headers the browser blocks every fetch()
  // response before the app ever sees it. Every route here already enforces its own
  // authorization (Bearer token or public-by-design), so allowing any origin is safe.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })
  app.use(healthRouter)
  app.use(plotsRouter)
  app.use(catalogRouter)
  app.use(pricesRouter)
  app.use(internalRouter)
  app.use(authRouter)
  app.use(errorHandler)
  return app
}
