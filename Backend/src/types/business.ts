export interface BusinessInputs {
  crop: string
  area: number
  seed: number
  fertilizer: number
  water: number
  labor: number
  machinery: number
  transport: number
  other: number
  yieldTonHa: number
  priceTon: number
}

export interface EconomicResult {
  investment: number
  production: number
  revenue: number
  profit: number
  costPerHa: number | null
  costPerTon: number | null
  marginPct: number | null
  breakEvenTon: number | null
  breakEvenYield: number | null
}

export type PriceScenario = 'floor' | 'average' | 'optimistic' | 'drop'
