import type { DataKind, DataOrigin, Provenance } from '../types/provenance'

const DATA_KINDS: DataKind[] = ['historical', 'satelliteObservation', 'estimated', 'recorded']
const DATA_ORIGINS: DataOrigin[] = ['real', 'simulated', 'demo']

type ValidationResult =
  | { ok: true; value: Provenance }
  | { ok: false; errors: string[] }

export function validateProvenance(value: unknown): ValidationResult {
  const errors: string[] = []
  const v = (value ?? {}) as Record<string, unknown>

  for (const field of ['source', 'product', 'version'] as const) {
    if (typeof v[field] !== 'string' || v[field] === '') {
      errors.push(`${field} must be a non-empty string`)
    }
  }

  if (typeof v.asOf !== 'string' || Number.isNaN(Date.parse(v.asOf))) {
    errors.push('asOf must be a parseable ISO date string')
  }

  if (typeof v.latencyDays !== 'number' || !Number.isFinite(v.latencyDays) || v.latencyDays < 0) {
    errors.push('latencyDays must be a finite number >= 0')
  }

  if (!DATA_KINDS.includes(v.kind as DataKind)) {
    errors.push(`kind must be one of ${DATA_KINDS.join(', ')}`)
  }

  if (!DATA_ORIGINS.includes(v.origin as DataOrigin)) {
    errors.push(`origin must be one of ${DATA_ORIGINS.join(', ')}`)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, value: v as unknown as Provenance }
}
