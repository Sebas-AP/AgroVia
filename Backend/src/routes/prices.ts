import { Router } from 'express'
import { runtimeProviders } from '../providers/runtime'

export const pricesRouter = Router()

// ASSUMPTION: GET /prices/:crop has no plot context to read a municipality from (spec §13 names
// it GET /prices/:crop, no plot id), so the pilot zone's municipality is the default. Callers
// with a plot should pass ?municipality=... explicitly.
const DEFAULT_MUNICIPALITY = 'Guadalupe Victoria'

pricesRouter.get('/prices/:crop', async (req, res, next) => {
  try {
    const municipality = typeof req.query.municipality === 'string' && req.query.municipality !== ''
      ? req.query.municipality
      : DEFAULT_MUNICIPALITY
    const mode = req.query.mode === 'irrigated' || req.query.mode === 'rainfed'
      ? req.query.mode
      : undefined
    const snapshot = await runtimeProviders.prices.getSnapshot(
      req.params.crop, municipality, new Date().toISOString().slice(0, 10), mode,
    )
    res.json(snapshot)
  } catch (err) {
    next(err)
  }
})
