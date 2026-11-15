import { describe, it, expect } from 'vitest'
import { computeEconomicResult, computeScenarioPrices } from '../../../src/engines/economics'

describe('computeEconomicResult', () => {
  const base = { crop: 'corn', area: 2, seed: 100, fertilizer: 200, water: 50, labor: 300,
    machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000 }

  it('computes investment, production, revenue, and profit per the spec formulas', () => {
    const result = computeEconomicResult(base)
    expect(result.investment).toBe(100 + 200 + 50 + 300 + 150 + 80 + 20)
    expect(result.production).toBe(2 * 3)
    expect(result.revenue).toBe(result.production * 4000)
    expect(result.profit).toBe(result.revenue - result.investment)
  })

  it('raises profit by exactly the removed cost when seed drops to zero', () => {
    const withSeed = computeEconomicResult(base)
    const withoutSeed = computeEconomicResult({ ...base, seed: 0 })
    expect(withoutSeed.profit - withSeed.profit).toBe(base.seed)
  })

  it('returns null, never Infinity, when production is zero', () => {
    const result = computeEconomicResult({ ...base, yieldTonHa: 0 })
    expect(result.costPerTon).toBeNull()
    expect(result.breakEvenYield).toBeNull()
  })
})

describe('computeScenarioPrices', () => {
  it('drops the guaranteed-price floor once area exceeds the 5 ha small-producer limit', () => {
    const under5ha = computeScenarioPrices(
      { ruralAvgPriceKg: 5, wholesalePriceKg: 6, guaranteedPriceTon: 4500, areaHa: 4 },
      [{ priceTon: 4000 }, { priceTon: 4200 }],
    )
    const over5ha = computeScenarioPrices(
      { ruralAvgPriceKg: 5, wholesalePriceKg: 6, guaranteedPriceTon: 4500, areaHa: 6 },
      [{ priceTon: 4000 }, { priceTon: 4200 }],
    )
    expect(under5ha.floor).toBe(4500)
    expect(over5ha.floor).not.toBe(4500)
  })
})
