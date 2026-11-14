import { Router } from 'express'
import { SimulatedPricesProvider } from '../providers/PricesProvider'

export const pricesRouter = Router()

const pricesProvider = new SimulatedPricesProvider()
// ASSUMPTION: this route has no plot context to read a municipality from (spec §13 names it
// GET /prices/:crop, no plot id), so it uses the pilot zone's municipality as a stand-in until
// a real per-municipality price worker (spec §15 step 10) replaces this simulated provider.
const DEFAULT_MUNICIPALITY = 'Guadalupe Victoria'

pricesRouter.get('/prices/:crop', async (req, res, next) => {
  try {
    const asOfDate = new Date().toISOString().slice(0, 10)
    const snapshot = await pricesProvider.getSnapshot(req.params.crop, DEFAULT_MUNICIPALITY, asOfDate)
    res.json(snapshot)
  } catch (err) {
    next(err)
  }
})
