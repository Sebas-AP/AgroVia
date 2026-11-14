import type { Provenance } from '../types/provenance'
import { seededRandom, enumerateDates } from './seededRandom'

export interface SoilMoistureDay {
  date: string
  smSurface: number
  smRootzone: number
  smRootzonePctl: number | null
  soilTempLayer1: number
  provenance: Provenance
}

export interface SoilMoistureProvider {
  getDailySeries(cellId: string, from: string, to: string): Promise<SoilMoistureDay[]>
}

export class SimulatedSoilMoistureProvider implements SoilMoistureProvider {
  async getDailySeries(cellId: string, from: string, to: string): Promise<SoilMoistureDay[]> {
    const dates = enumerateDates(from, to)
    return dates.map((date) => {
      const rand = seededRandom(`${cellId}:${date}:smap`)
      return {
        date,
        smSurface: Math.round(rand() * 100) / 100,
        smRootzone: Math.round(rand() * 100) / 100,
        smRootzonePctl: Math.round(rand() * 100),
        soilTempLayer1: Math.round(rand() * 400) / 10,
        provenance: {
          source: 'SMAP SPL4SMGP (simulated)',
          product: 'v8',
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
