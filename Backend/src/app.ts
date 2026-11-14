import express from 'express'
import { healthRouter } from './routes/health'
import { plotsRouter } from './routes/plots'
import { catalogRouter } from './routes/catalog'
import { pricesRouter } from './routes/prices'
import { internalRouter } from './routes/internal'
import { errorHandler } from './middleware/errorHandler'

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
