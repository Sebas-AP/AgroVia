import type { Provenance } from '../types/provenance'
import { seededRandom, enumerateDates } from './seededRandom'
import { parseCellId } from '../firestore/cellId'
import type { ModeloClient } from '../integration/modeloClient'

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

// Calls Modelo's POST /api/v1/ndvi (real ORNL DAAC MODIS data, cached there by window — see
// Modelo/agrovia_api/cache.py). cellId encodes the already-snapped cell coordinate
// (firestore/cellId.ts), which stands in for a true per-cell lookup since Modelo's route is
// point-based, not cell-based.
//
// `evi` is NaN: Modelo's NDVI client only fetches the NDVI band, never EVI, and nothing in the
// indicators engine reads NdviDay.evi today — NaN (not a plausible-looking number) is the
// honest way to fill a required field with "not actually measured" rather than inventing a
// value (project rule: no fabricated data). `qualityOk` is true for every point because
// Modelo's client already discards sub-fill-threshold pixels before returning them.
export class ModeloNdviProvider implements NdviProvider {
  constructor(private readonly client: ModeloClient) {}

  async getSeries(cellId: string, from: string, to: string): Promise<NdviDay[]> {
    const { lat, lon } = parseCellId(cellId)
    const response = await this.client.ndvi({ latitud: lat, longitud: lon, inicio: from, fin: to })
    return response.serie.map((point) => ({
      date: point.fecha,
      ndvi: point.ndvi,
      evi: Number.NaN,
      qualityOk: true,
      provenance: {
        source: response.fuente,
        product: response.producto,
        version: 'live-1',
        asOf: to,
        // ASSUMPTION: Modelo doesn't surface MODIS composite latency; 0 matches the simulated
        // provider's placeholder rather than a measured figure. Revisit if that becomes available.
        latencyDays: 0,
        kind: 'satelliteObservation',
        origin: 'real',
      },
    }))
  }
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
