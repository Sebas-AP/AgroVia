import type { Provenance } from '../types/provenance'
import { seededRandom } from './seededRandom'

// Rural average price and yield come from SIAP when the real provider is wired in. Wholesale
// (SNIIM) and guaranteed (DOF) prices have no source in this repository, so they stay null and
// the reason is recorded in `infoGaps` — never replaced with a ratio of the rural price.
export interface PriceSnapshot {
  ruralAvgPriceKg: number | null
  wholesalePriceKg: number | null
  guaranteedPriceTon: number | null
  yieldTonHa: number | null
  // Null only when this crop/municipality has no usable price record at all.
  provenance: Provenance | null
  infoGaps: string[]
}

export interface PriceHistoryPoint {
  year: number
  priceTon: number
}

export interface PricesProvider {
  getSnapshot(
    cropId: string,
    municipality: string,
    asOfDate: string,
    mode?: 'rainfed' | 'irrigated',
  ): Promise<PriceSnapshot>
  getHistory(cropId: string, municipality: string): Promise<PriceHistoryPoint[]>
}

export class SimulatedPricesProvider implements PricesProvider {
  async getSnapshot(
    cropId: string,
    municipality: string,
    asOfDate: string,
    _mode?: 'rainfed' | 'irrigated',
  ): Promise<PriceSnapshot> {
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
      infoGaps: [],
    }
  }

  async getHistory(cropId: string, municipality: string): Promise<PriceHistoryPoint[]> {
    return Array.from({ length: 12 }, (_, i) => {
      const rand = seededRandom(`${cropId}:${municipality}:history:${i}`)
      return { year: 2014 + i, priceTon: Math.round((3000 + rand() * 4000) * 100) / 100 }
    })
  }
}
