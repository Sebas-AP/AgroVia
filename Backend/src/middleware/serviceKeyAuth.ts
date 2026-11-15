import type { Request, Response, NextFunction } from 'express'
import { unauthorized } from './errorHandler'

export function serviceKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SERVICE_KEY
  const provided = req.header('x-service-key')
  if (!expected || provided !== expected) {
    next(unauthorized('Missing or invalid service key.'))
    return
  }
  next()
}
