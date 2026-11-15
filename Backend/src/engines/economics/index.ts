import type { BusinessInputs, EconomicResult, PriceScenario } from '../../types/business'

const SMALL_PRODUCER_LIMIT_HA = 5
const DEFAULT_OPTIMISTIC_DISCOUNT_PCT = 0.1
const DROP_PERCENTILE = 0.1

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function marginPct(profit: number, revenue: number): number | null {
  const margin = safeDivide(profit, revenue)
  return margin === null ? null : margin * 100
}

function breakEvenYield(investment: number, priceTon: number, area: number): number | null {
  const breakEvenTon = safeDivide(investment, priceTon)
  return breakEvenTon === null ? null : safeDivide(breakEvenTon, area)
}

export function computeEconomicResult(inputs: BusinessInputs): EconomicResult {
  const investment = inputs.seed + inputs.fertilizer + inputs.water + inputs.labor
    + inputs.machinery + inputs.transport + inputs.other
  const production = inputs.area * inputs.yieldTonHa
  const revenue = production * inputs.priceTon
  const profit = revenue - investment

  return {
    investment,
    production,
    revenue,
    profit,
    costPerHa: safeDivide(investment, inputs.area),
    costPerTon: safeDivide(investment, production),
    marginPct: marginPct(profit, revenue),
    breakEvenTon: safeDivide(investment, inputs.priceTon),
    // production === 0 (no realized yield) makes "yield needed to break even" undefined too,
    // even though the bare formula (investment / priceTon / area) doesn't itself divide by
    // production — required by this task's test, ledgered as a ruling.
    breakEvenYield: production === 0 ? null : breakEvenYield(investment, inputs.priceTon, inputs.area),
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.floor(p * (sorted.length - 1))
  return sorted[index]
}

export function computeScenarioPrices(
  crop: { ruralAvgPriceKg: number; wholesalePriceKg: number; guaranteedPriceTon: number | null; areaHa: number },
  priceHistory: { priceTon: number }[],
  discountPct: number = DEFAULT_OPTIMISTIC_DISCOUNT_PCT,
): Record<PriceScenario, number | null> {
  const history = priceHistory.map((p) => p.priceTon)
  const qualifiesForFloor = crop.areaHa <= SMALL_PRODUCER_LIMIT_HA && crop.guaranteedPriceTon !== null

  const floor = qualifiesForFloor
    ? crop.guaranteedPriceTon
    : (history.length > 0 ? Math.min(...history) : null)
  const historicalDrop = history.length > 0 ? percentile(history, DROP_PERCENTILE) : null
  // `floor`, where it applies, is a price guarantee: the farmer cannot realize less than it even
  // in the worst-case scenario, so `drop` must never fall below it. In the non-qualifying branch
  // this already holds (floor is the history's own min, <= any percentile of that same history);
  // this clamp is the one that matters when the guaranteed price applies.
  const drop = floor === null ? historicalDrop : Math.max(historicalDrop ?? floor, floor)

  return {
    floor,
    average: crop.ruralAvgPriceKg * 1000,
    optimistic: crop.wholesalePriceKg * 1000 * (1 - discountPct),
    drop,
  }
}
