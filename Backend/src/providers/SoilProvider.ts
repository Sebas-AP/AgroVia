import type { Provenance } from '../types/provenance'
import { seededRandom } from './seededRandom'

export interface StaticSoilProfile {
  slopeDegrees: number
  sandPct: number
  siltPct: number
  clayPct: number
  organicCarbon: number
  pH: number
  cec: number
  waterRetentionMm: number
  provenance: Provenance
}

export interface SoilProvider {
  getStaticProfile(lat: number, lon: number): Promise<StaticSoilProfile>
}

export class SimulatedSoilProvider implements SoilProvider {
  async getStaticProfile(lat: number, lon: number): Promise<StaticSoilProfile> {
    const rand = seededRandom(`${lat}:${lon}:soil`)
    const sandPct = Math.round(rand() * 60)
    const siltPct = Math.round(rand() * (100 - sandPct))
    const clayPct = 100 - sandPct - siltPct
    return {
      slopeDegrees: Math.round(rand() * 150) / 10,
      sandPct,
      siltPct,
      clayPct,
      organicCarbon: Math.round(rand() * 30) / 10,
      pH: Math.round((5.5 + rand() * 2.5) * 10) / 10,
      cec: Math.round(rand() * 300) / 10,
      waterRetentionMm: Math.round(rand() * 2000) / 10,
      provenance: {
        source: 'SoilGrids 250m v2 + SRTM (simulated)',
        product: 'static soil profile',
        version: 'sim-1',
        asOf: new Date().toISOString().slice(0, 10),
        latencyDays: 0,
        kind: 'estimated',
        origin: 'simulated',
      },
    }
  }
}
