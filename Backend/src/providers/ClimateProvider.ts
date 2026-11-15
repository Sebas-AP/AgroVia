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

// Physically plausible ranges for the Guadalupe Victoria semi-arid highland pilot zone — not
// NASA POWER data, but shaped so simulated output doesn't read as obviously broken (e.g. a
// 90°C day) while developing against it. Real values come from the worker-power follow-up plan.
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export class SimulatedClimateProvider implements ClimateProvider {
  async getDailySeries(cellId: string, from: string, to: string): Promise<ClimateDay[]> {
    const dates = enumerateDates(from, to)
    return dates.map((date) => {
      const rand = seededRandom(`${cellId}:${date}`)
      const t2m = round1(5 + rand() * 23) // 5-28 C average
      const spread = 4 + rand() * 6 // 4-10 C day/night swing
      const values: Record<string, number> = {
        T2M: t2m,
        T2M_MAX: round1(t2m + spread / 2),
        T2M_MIN: round1(t2m - spread / 2),
        RH2M: round1(20 + rand() * 50), // 20-70%
        // Skewed toward low/no rain, as expected for a semi-arid zone, with rare heavier days.
        PRECTOTCORR: round1(rand() * rand() * 30),
        GWETTOP: round1(0.1 + rand() * 0.3),
        GWETROOT: round1(0.1 + rand() * 0.3),
        GWETPROF: round1(0.1 + rand() * 0.3),
        TS: round1(t2m + (rand() - 0.5) * 4),
        ALLSKY_SFC_SW_DWN: round1(150 + rand() * 150),
        WS2M: round1(1 + rand() * 5),
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
