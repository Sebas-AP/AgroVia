import { Router } from 'express'
import { getAdminAuth } from '../firestore/admin'

export const authRouter = Router()

// No real "create a plot" flow exists yet (see INTEGRACION.md §5) — every client that wants to
// exercise /plots/:id/* authenticates as the fixed demo owner instead of a real per-user account.
// Minting a custom token for that one, non-privileged, example-data-only uid needs no auth itself:
// the Admin SDK credential that signs it never leaves this server, and 'demo-owner' can only ever
// reach the single demo plot already seeded under it.
const DEMO_OWNER_UID = 'demo-owner'

authRouter.post('/auth/demo-token', async (_req, res, next) => {
  try {
    const token = await getAdminAuth().createCustomToken(DEMO_OWNER_UID)
    res.json({ token })
  } catch (err) {
    next(err)
  }
})
