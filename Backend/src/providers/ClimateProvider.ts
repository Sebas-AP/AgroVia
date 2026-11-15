import type { Provenance } from '../types/provenance'
import { seededRandom, enumerateDates } from './seededRandom'
import { parseCellId } from '../firestore/cellId'
import type { ModeloClient } from '../integration/modeloClient'

export interface ClimateDay {
  date: string
  values: Record<string, number>
  provenance: Provenance
}

export interface ClimateProvider {
  getDailySeries(cellId: string, from: string, to: string): Promise<ClimateDay[]>
}

// Calls Modelo's POST /api/v1/clima/diario (real NASA POWER daily point data, cached there by
// window — see Modelo/agrovia_api/cache.py). cellId encodes the already-snapped cell coordinate
// (firestore/cellId.ts), which stands in for a true per-cell lookup because Modelo's route is
// point-based, not cell-based.
//
// The returned array is deliberately DENSE: exactly one entry per calendar day in [from, to],
// with `values: {}` for a day Modelo reported no usable reading for. The indicators engine's
// gap imputation (engines/indicators/imputation.ts) detects gaps by array position, so dropping
// a dataless day instead of including it empty would silently break gap detection — that is not
// data fabrication, it is preserving the calendar so missing days stay visibly missing.
export class ModeloClimateProvider implements ClimateProvider {
  constructor(private readonly client: ModeloClient) {}

  async getDailySeries(cellId: string, from: string, to: string): Promise<ClimateDay[]> {
    const { lat, lon } = parseCellId(cellId)
    const response = await this.client.climaDiario({ latitud: lat, longitud: lon, inicio: from, fin: to })
    // Modelo only includes days that had at least one usable parameter; a day may also be
    // present with only some of its parameters. Both cases are preserved as received.
    const valuesByDate = new Map(response.serie.map((point) => [point.fecha, point.valores]))
    return enumerateDates(from, to).map((date) => ({
      date,
      values: valuesByDate.get(date) ?? {},
      provenance: {
        source: response.fuente,
        product: 'AG community daily',
        version: 'live-1',
        asOf: to,
        // ASSUMPTION: Modelo doesn't surface NASA POWER ingestion latency; 0 matches the
        // simulated provider's placeholder rather than a measured figure, same as
        // ModeloNdviProvider. Revisit if Modelo starts exposing it.
        latencyDays: 0,
        kind: 'historical',
        origin: 'real',
      },
    }))
  }
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
