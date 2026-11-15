import { Router } from 'express'
import { runtimeProviders } from '../providers/runtime'

export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  // dataMode is part of the health contract so a deployment can verify whether it is serving
  // real or simulated providers without guessing from response provenance.
  res.json({ status: 'ok', dataMode: runtimeProviders.dataMode })
})
