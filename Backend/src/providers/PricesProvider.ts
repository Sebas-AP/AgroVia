import type { Provenance } from '../types/provenance'
import { seededRandom } from './seededRandom'

export interface PriceSnapshot {
  ruralAvgPriceKg: number
  wholesalePriceKg: number
  guaranteedPriceTon: number | null
  yieldTonHa: number
  provenance: Provenance
}

export interface PricesProvider {
  getSnapshot(cropId: string, municipality: string, asOfDate: string): Promise<PriceSnapshot>
}

export class SimulatedPricesProvider implements PricesProvider {
  async getSnapshot(cropId: string, municipality: string, asOfDate: string): Promise<PriceSnapshot> {
    const rand = seededRandom(`${cropId}:${municipality}:${asOfDate}`)
    const ruralAvgPriceKg = Math.round((3 + rand() * 4) * 100) / 100
    return {
      ruralAvgPriceKg,
      wholesalePriceKg: Math.round(ruralAvgPriceKg * (1.1 + rand() * 0.3) * 100) / 100,
      guaranteedPriceTon: Math.round(ruralAvgPriceKg * 1000 * 1.05),
      yieldTonHa: Math.round((2 + rand() * 4) * 10) / 10,
      provenance: {
        source: 'SIAP/SNIIM (simulated)',
        product: 'rural average + wholesale price',
        version: 'sim-1',
        asOf: asOfDate,
        latencyDays: 0,
        kind: 'estimated',
        origin: 'simulated',
      },
    }
  }
}
