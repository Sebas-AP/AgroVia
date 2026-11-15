import { Router } from 'express'
import { serviceKeyAuth } from '../middleware/serviceKeyAuth'
import { badRequest } from '../middleware/errorHandler'
import { validateProvenance } from '../validators/provenanceValidator'
import { getAdminFirestore } from '../firestore/admin'
import { COLLECTIONS } from '../firestore/collections'

export const internalRouter = Router()

internalRouter.use('/internal', serviceKeyAuth)

// Accepts one day of a cell's series and stores it in cells/{cellId}/series/{date}. The real
// per-source workers (spec §15 steps 9-14) are out of scope for this plan; this route exists so
// the ingest contract is in place and testable, with provenance enforced from day one.
internalRouter.post('/internal/ingest/:source', async (req, res, next) => {
  try {
    const { cellId, date, values, provenance } = req.body as {
      cellId?: string; date?: string; values?: Record<string, unknown>; provenance?: unknown
    }
    if (!cellId || !date || !values) {
      next(badRequest('cellId, date, and values are required.'))
      return
    }
    const result = validateProvenance(provenance)
    if (!result.ok) {
      next(badRequest('Invalid provenance.', result.errors))
      return
    }
    await getAdminFirestore()
      .collection(COLLECTIONS.cellSeries(cellId))
      .doc(date)
      .set({ values, provenance: result.value })
    res.status(202).json({ accepted: true })
  } catch (err) {
    next(err)
  }
})
