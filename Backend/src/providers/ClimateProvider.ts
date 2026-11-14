import type { Provenance } from '../types/provenance'
import { seededRandom, enumerateDates } from './seededRandom'

export interface ClimateDay {
  date: string
  values: Record<string, number>
  provenance: Provenance
}

export interface ClimateProvider {
  getDailySeries(cellId: string, from: string, to: string): Promise<ClimateDay[]>
}

const PARAMS = [
  'T2M', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'PRECTOTCORR', 'GWETTOP', 'GWETROOT',
  'GWETPROF', 'TS', 'ALLSKY_SFC_SW_DWN', 'WS2M',
]

export class SimulatedClimateProvider implements ClimateProvider {
  async getDailySeries(cellId: string, from: string, to: string): Promise<ClimateDay[]> {
    const dates = enumerateDates(from, to)
    return dates.map((date) => {
      const rand = seededRandom(`${cellId}:${date}`)
      const values: Record<string, number> = {}
      for (const param of PARAMS) {
        values[param] = Math.round(rand() * 1000) / 10
      }
      return {
        date,
        values,
        provenance: {
          source: 'NASA POWER (simulated)',
          product: 'AG community daily',
          version: 'sim-1',
          asOf: date,
          latencyDays: 0,
          kind: 'historical',
          origin: 'simulated',
        },
      }
    })
  }
}
