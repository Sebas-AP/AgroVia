import type { Provenance } from '../types/provenance'
import { seededRandom, enumerateDates } from './seededRandom'

export interface NdviDay {
  date: string
  ndvi: number
  evi: number
  qualityOk: boolean
  provenance: Provenance
}

export interface NdviProvider {
  getSeries(cellId: string, from: string, to: string): Promise<NdviDay[]>
}

export class SimulatedNdviProvider implements NdviProvider {
  async getSeries(cellId: string, from: string, to: string): Promise<NdviDay[]> {
    const dates = enumerateDates(from, to)
    return dates.map((date) => {
      const rand = seededRandom(`${cellId}:${date}:modis`)
      return {
        date,
        ndvi: Math.round(rand() * 100) / 100,
        evi: Math.round(rand() * 100) / 100,
        qualityOk: rand() > 0.1,
        provenance: {
          source: 'MODIS MOD13Q1 (simulated)',
          product: 'NDVI/EVI',
          version: 'sim-1',
          asOf: date,
          latencyDays: 0,
          kind: 'satelliteObservation',
          origin: 'simulated',
        },
      }
    })
  }
}
