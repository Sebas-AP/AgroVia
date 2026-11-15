import type { CropCatalogEntry, PlotPriorities, PlotIndicators, StrategyScores } from '../../types/firestoreDocs'
import type { StaticSoilProfile } from '../../providers/SoilProvider'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
}

const ORGANIC_MATTER_SCORE: Record<CropCatalogEntry['organicMatterContribution'], number> = {
  low: 10, medium: 20, high: 30,
}

// Spec §9 names water/soil/climateRisk/pests/economy/market as the six score criteria, weighted
// "by the plot's priorities" — but a plot's 7 PlotPriorities fields (water, income, forage,
// nitrogen, erosion, organicMatter, market) don't name-match those six. Mapping, documented once
// here (plan Task 8 ruling):
export function scoreWater(crops: CropCatalogEntry[], priorities: PlotPriorities): number {
  const base = average(crops.map((c) => clamp(100 - c.waterRequiredMm / 10, 0, 100)))
  return base * (priorities.water / 5)
}

export function scoreSoil(
  crops: CropCatalogEntry[],
  staticProfile: StaticSoilProfile,
  priorities: PlotPriorities,
): number {
  const base = average(
    crops.map((c) => {
      const nitrogenBonus = c.fixesNitrogen ? 30 : 0
      const organicMatter = ORGANIC_MATTER_SCORE[c.organicMatterContribution]
      const erosionProtection = clamp(40 - staticProfile.slopeDegrees * 2, 0, 40)
      return clamp(nitrogenBonus + organicMatter + erosionProtection, 0, 100)
    }),
  )
  const weight = (priorities.nitrogen + priorities.organicMatter + priorities.erosion) / 3 / 5
  return base * weight
}

// ASSUMPTION: no priority field maps to climateRisk or pests (spec §6's priorities list has none),
// so both pass their base score through unweighted (weight 1).
export function scoreClimateRisk(indicators: PlotIndicators): number {
  return clamp(100 - (indicators.frostDays + indicators.heatStressDays) * 5, 0, 100)
}

export function scorePests(sequence: { crop: string }[]): number {
  let penalty = 0
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i].crop === sequence[i - 1].crop) {
      penalty += 30
    }
  }
  return clamp(100 - penalty, 0, 100)
}

// ASSUMPTION: real margin/price data isn't available at this layer (spec's economics engine runs
// separately, over the farmer's actual costs — see plan Task 9/10); economy and market use a
// fixed neutral base (50) scaled by the matching priority, as a proxy until the route composes
// this with the economics engine's real output.
const ECONOMIC_PROXY_BASE = 50

export function scoreEconomy(priorities: PlotPriorities): number {
  return ECONOMIC_PROXY_BASE * (priorities.income / 5)
}

export function scoreMarket(priorities: PlotPriorities): number {
  return ECONOMIC_PROXY_BASE * (priorities.market / 5)
}

// ASSUMPTION: like climateRisk/pests above, no PlotPriorities field maps to the model's
// predicted success probability, so it passes through unweighted (weight 1) — same precedent,
// not a new rule invented for this criterion.
export function scoreModelSuccess(
  sequence: { crop: string }[],
  modelSuccessByCrop: Record<string, number> | undefined,
): number | undefined {
  if (!modelSuccessByCrop) {
    return undefined
  }
  const probabilities = sequence
    .map((s) => modelSuccessByCrop[s.crop])
    .filter((p): p is number => typeof p === 'number')
  return probabilities.length === 0 ? undefined : average(probabilities) * 100
}

export function combineScores(
  crops: CropCatalogEntry[],
  sequence: { crop: string }[],
  staticProfile: StaticSoilProfile,
  indicators: PlotIndicators,
  priorities: PlotPriorities,
  modelSuccessByCrop?: Record<string, number>,
): { scores: StrategyScores; totalScore: number } {
  const modelSuccess = scoreModelSuccess(sequence, modelSuccessByCrop)
  const scores: StrategyScores = {
    water: scoreWater(crops, priorities),
    soil: scoreSoil(crops, staticProfile, priorities),
    climateRisk: scoreClimateRisk(indicators),
    pests: scorePests(sequence),
    economy: scoreEconomy(priorities),
    market: scoreMarket(priorities),
    ...(modelSuccess === undefined ? {} : { modelSuccess }),
  }
  const totalScore = average(Object.values(scores))
  return { scores, totalScore }
}
