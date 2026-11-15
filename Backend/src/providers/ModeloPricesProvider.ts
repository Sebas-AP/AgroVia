import type { PricesProvider, PriceSnapshot, PriceHistoryPoint } from './PricesProvider'
import type { ModeloClient } from '../integration/modeloClient'
import type { PreciosSIAP, RegistroPrecioSIAP } from '../integration/modeloTypes'
import { toModeloCropId } from '../integration/modeloCropIds'
import type { Provenance } from '../types/provenance'

const SIAP_PRODUCT = 'Precio medio rural y rendimiento municipal'
const MODALITY_BY_MODE: Record<'rainfed' | 'irrigated', string> = {
  rainfed: 'temporal',
  irrigated: 'riego',
}
// SIAP "Preciomediorural" is MXN per tonne; the Backend's PriceSnapshot speaks MXN per kg.
const KG_PER_TON = 1000

// A single year can contain several cycles/modalities with very different reported prices (for
// example Guadalupe Victoria corn 2024: 1.88 MXN/t rainfed vs 7,097.78 MXN/t irrigated). The
// dataset keeps every row untouched. The snapshot is a documented, volume-weighted municipal
// average so a tiny, atypical row cannot become the whole district's price; when the spread is
// this wide the reason is reported instead of silently smoothing it away.
const WIDE_SPREAD_RATIO = 5

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function weightedAverage(
  rows: RegistroPrecioSIAP[],
  valueOf: (row: RegistroPrecioSIAP) => number | null,
  weightOf: (row: RegistroPrecioSIAP) => number | null,
): number | null {
  const usable = rows
    .map((row) => ({ value: valueOf(row), weight: weightOf(row) }))
    .filter((entry): entry is { value: number; weight: number } =>
      entry.value !== null && entry.value > 0 && entry.weight !== null && entry.weight > 0)
  if (usable.length === 0) {
    return null
  }
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0)
  if (totalWeight === 0) {
    return null
  }
  return usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight
}

function simpleAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// Price is a market quantity, so it is aggregated across every cycle/modality of the year,
// weighted by produced volume (the most meaningful weight SIAP provides). Area is the fallback
// when volume is absent, and a plain mean is the last resort when SIAP reports neither.
export function municipalPricePerTon(rows: RegistroPrecioSIAP[]): number | null {
  const volumeWeighted = weightedAverage(
    rows,
    (row) => row.precio_mxn_t,
    (row) => row.volumen_t,
  )
  if (volumeWeighted !== null) {
    return volumeWeighted
  }
  const areaWeighted = weightedAverage(
    rows,
    (row) => row.precio_mxn_t,
    (row) => row.superficie_cosechada_ha,
  )
  if (areaWeighted !== null) {
    return areaWeighted
  }
  return simpleAverage(
    rows.map((row) => row.precio_mxn_t).filter((value): value is number => value !== null && value > 0),
  )
}

// Yield is agronomic, so it prefers the plot's own modality (rainfed vs irrigated) and is
// weighted by harvested area. If that modality has no rows, the municipal mixed average is used
// and the substitution is reported as a gap.
export function municipalYieldTonHa(
  rows: RegistroPrecioSIAP[],
  mode: 'rainfed' | 'irrigated' | undefined,
): { value: number | null; usedModality: string | null } {
  const withYield = rows.filter(
    (row) => row.rendimiento_t_ha !== null && row.rendimiento_t_ha > 0,
  )
  if (withYield.length === 0) {
    return { value: null, usedModality: null }
  }

  const modality = mode ? MODALITY_BY_MODE[mode] : null
  const preferred = modality
    ? withYield.filter((row) => row.modalidad?.toLowerCase() === modality)
    : []
  const candidates = preferred.length > 0 ? preferred : withYield

  const areaWeighted = weightedAverage(
    candidates,
    (row) => row.rendimiento_t_ha,
    (row) => row.superficie_cosechada_ha,
  )
  const value = areaWeighted ?? simpleAverage(
    candidates
      .map((row) => row.rendimiento_t_ha)
      .filter((entry): entry is number => entry !== null && entry > 0),
  )
  return {
    value,
    usedModality: preferred.length > 0 ? modality : (modality === null ? null : 'mixed'),
  }
}

function latestYear(rows: RegistroPrecioSIAP[], maxYear: number): number | null {
  const years = rows
    .map((row) => row.anio)
    .filter((year) => year <= maxYear)
  return years.length === 0 ? null : Math.max(...years)
}

export class ModeloPricesProvider implements PricesProvider {
  // getSnapshot + getHistory for the same crop/municipality share one Modelo request per
  // provider instance; the rotations route asks for both at once for each distinct crop.
  private readonly cache = new Map<string, Promise<PreciosSIAP | null>>()

  constructor(private readonly client: ModeloClient) {}

  private fetch(cropId: string, municipality: string): Promise<PreciosSIAP | null> {
    const key = `${cropId}|${municipality}`
    const cached = this.cache.get(key)
    if (cached) {
      return cached
    }
    const modeloCropId = toModeloCropId(cropId)
    const request = modeloCropId
      ? this.client.precios({ cultivo_id: modeloCropId, municipio: municipality })
      : Promise.resolve(null)
    this.cache.set(key, request)
    return request
  }

  async getSnapshot(
    cropId: string,
    municipality: string,
    asOfDate: string,
    mode?: 'rainfed' | 'irrigated',
  ): Promise<PriceSnapshot> {
    const response = await this.fetch(cropId, municipality)
    if (!response) {
      return this.emptySnapshot(
        `No SIAP crop mapping for "${cropId}", so no real price or yield can be shown.`,
      )
    }
    if (response.registros.length === 0) {
      return this.emptySnapshot(
        `No SIAP record for "${response.cultivo_id}" in ${municipality}.`,
        response.advertencias,
      )
    }

    const asOfYear = Number(asOfDate.slice(0, 4))
    const year = latestYear(
      response.registros,
      Number.isFinite(asOfYear) ? asOfYear : Number.MAX_SAFE_INTEGER,
    )
    if (year === null) {
      return this.emptySnapshot(
        `No SIAP record at or before ${asOfDate} for "${response.cultivo_id}" in ${municipality}.`,
        response.advertencias,
      )
    }

    const rows = response.registros.filter((row) => row.anio === year)
    const pricePerTon = municipalPricePerTon(rows)
    const yieldResult = municipalYieldTonHa(rows, mode)
    const infoGaps = [
      'Wholesale price (SNIIM) is not connected, so the optimistic price scenario is unavailable.',
      'Guaranteed price (DOF) is not available, so the guaranteed-price floor is unavailable.',
      ...response.advertencias,
    ]

    if (yieldResult.value === null) {
      infoGaps.push(`SIAP has no usable yield for "${response.cultivo_id}" in ${municipality} (${year}).`)
    } else if (yieldResult.usedModality === 'mixed' && mode) {
      infoGaps.push(
        `SIAP has no ${MODALITY_BY_MODE[mode]} yield for "${response.cultivo_id}" in ${municipality} ` +
        `(${year}); the displayed yield is the municipal mixed-modality average.`,
      )
    }

    const prices = rows
      .map((row) => row.precio_mxn_t)
      .filter((value): value is number => value !== null && value > 0)
    if (prices.length > 1) {
      const ratio = Math.max(...prices) / Math.min(...prices)
      if (ratio >= WIDE_SPREAD_RATIO) {
        infoGaps.push(
          `SIAP reports a ${round(ratio, 1)}x spread across cycles/modalities for ` +
          `"${response.cultivo_id}" in ${municipality} (${year}); the displayed price is the ` +
          'volume-weighted municipal average of those rows, not a corrected value.',
        )
      }
    }

    const provenance: Provenance | null = pricePerTon === null && yieldResult.value === null
      ? null
      : {
        source: response.fuente,
        product: SIAP_PRODUCT,
        version: response.version,
        // SIAP is annual: asOf is the year's closing date, never today's date.
        asOf: `${year}-12-31`,
        latencyDays: 0,
        kind: 'historical',
        origin: 'real',
      }

    if (pricePerTon === null) {
      infoGaps.push(`SIAP has no usable rural price for "${response.cultivo_id}" in ${municipality} (${year}).`)
    }

    return {
      ruralAvgPriceKg: pricePerTon === null ? null : round(pricePerTon / KG_PER_TON, 6),
      wholesalePriceKg: null,
      guaranteedPriceTon: null,
      yieldTonHa: yieldResult.value === null ? null : round(yieldResult.value, 4),
      provenance,
      infoGaps,
    }
  }

  async getHistory(cropId: string, municipality: string): Promise<PriceHistoryPoint[]> {
    const response = await this.fetch(cropId, municipality)
    if (!response) {
      return []
    }
    const byYear = new Map<number, RegistroPrecioSIAP[]>()
    for (const row of response.registros) {
      const rows = byYear.get(row.anio) ?? []
      rows.push(row)
      byYear.set(row.anio, rows)
    }
    const points: PriceHistoryPoint[] = []
    for (const [year, rows] of byYear) {
      const pricePerTon = municipalPricePerTon(rows)
      if (pricePerTon !== null) {
        points.push({ year, priceTon: round(pricePerTon, 2) })
      }
    }
    return points.sort((a, b) => a.year - b.year)
  }

  private emptySnapshot(reason: string, extra: string[] = []): PriceSnapshot {
    return {
      ruralAvgPriceKg: null,
      wholesalePriceKg: null,
      guaranteedPriceTon: null,
      yieldTonHa: null,
      provenance: null,
      infoGaps: [reason, ...extra],
    }
  }
}
