import type { Request, Response, NextFunction } from 'express'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message)
  }
}

export function notFound(message: string): ApiError {
  return new ApiError(404, 'not_found', message)
}

export function badRequest(message: string, detail?: unknown): ApiError {
  return new ApiError(400, 'bad_request', message, detail)
}

export function unauthorized(message: string): ApiError {
  return new ApiError(401, 'unauthorized', message)
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, detail: err.detail } })
    return
  }
  const message = err instanceof Error ? err.message : 'Unexpected error'
  res.status(500).json({ error: { code: 'internal_error', message } })
}
