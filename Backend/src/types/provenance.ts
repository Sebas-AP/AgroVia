export type DataOrigin = 'real' | 'simulated' | 'demo'
export type DataKind = 'historical' | 'satelliteObservation' | 'estimated' | 'recorded'

export interface Provenance {
  source: string
  product: string
  version: string
  asOf: string
  latencyDays: number
  kind: DataKind
  origin: DataOrigin
}

export interface Evidence {
  label: string
  value: string
  unit: string
  period: string
  provenance: Provenance
}
