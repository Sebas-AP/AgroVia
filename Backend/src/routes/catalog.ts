import { Router } from 'express'
import { getAdminFirestore } from '../firestore/admin'
import { COLLECTIONS } from '../firestore/collections'

export const catalogRouter = Router()

catalogRouter.get('/catalog/crops', async (_req, res, next) => {
  try {
    const snapshot = await getAdminFirestore().collection(COLLECTIONS.cropCatalog).get()
    res.json({ crops: snapshot.docs.map((doc) => doc.data()) })
  } catch (err) {
    next(err)
  }
})
