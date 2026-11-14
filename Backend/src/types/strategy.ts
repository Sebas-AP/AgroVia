import type { Evidence } from './provenance'
import type { PriceScenario, EconomicResult } from './business'
import type { StrategyScores } from './firestoreDocs'

export interface RotationStrategy {
  id: string
  type: 'current' | 'alternative'
  sequence: { year: number; crop: string }[]
  rationale: string
  evidence: Evidence[]
  benefits: string[]
  economics: { scenario: PriceScenario; priceTon: number; result: EconomicResult }[]
  infoGaps: string[]
  risks: string[]
  scores: StrategyScores
  totalScore: number
  summary: { sequenceText: string; shortRationale: string; avgMargin: number }
  engineVersion: string
  catalogVersion: string
  generatedAt: string
}
