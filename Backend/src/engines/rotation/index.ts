import type {
  PlotSnapshot, PlotPriorities, PlotIndicators, CropCatalogEntry,
} from '../../types/firestoreDocs'
import type { RotationStrategy } from '../../types/strategy'
import type { StaticSoilProfile } from '../../providers/SoilProvider'
import { filterCompatibleCrops } from './filters'
import { combineScores } from './scoring'

const ENGINE_VERSION = '1.0.0'
const CATALOG_VERSION = '1.0.0'

export interface GenerateStrategiesInput {
  plot: PlotSnapshot
  staticProfile: StaticSoilProfile
  seasons: { year: number; crop: string }[]
  priorities: PlotPriorities
  indicators: PlotIndicators
  catalog: CropCatalogEntry[]
}

function lookupCrops(
  cropIds: string[],
  catalog: CropCatalogEntry[],
  infoGaps: string[],
): CropCatalogEntry[] {
  const found: CropCatalogEntry[] = []
  for (const cropId of cropIds) {
    const entry = catalog.find((c) => c.id === cropId)
    if (entry) {
      found.push(entry)
    } else {
      infoGaps.push(`Crop "${cropId}" not found in catalog — no scoring evidence available for it.`)
    }
  }
  return found
}

function buildStrategy(
  id: string,
  type: RotationStrategy['type'],
  sequence: { year: number; crop: string }[],
  rationale: string,
  infoGaps: string[],
  catalog: CropCatalogEntry[],
  staticProfile: StaticSoilProfile,
  indicators: PlotIndicators,
  priorities: PlotPriorities,
): RotationStrategy {
  const crops = lookupCrops(sequence.map((s) => s.crop), catalog, infoGaps)
  const { scores, totalScore } = combineScores(crops, sequence, staticProfile, indicators, priorities)
  const sequenceText = sequence.map((s) => `${s.crop} (${s.year})`).join(' -> ')

  return {
    id,
    type,
    sequence,
    rationale,
    evidence: [],
    benefits: [],
    // Filled by the rotations route (Task 10), which also has the economics engine (Task 9) and
    // the farmer's real business inputs — neither is available at this layer.
    economics: [],
    infoGaps,
    risks: [],
    scores,
    totalScore,
    summary: {
      sequenceText,
      shortRationale: rationale.slice(0, 120),
      avgMargin: 0, // ASSUMPTION: real margin needs Task 9's economics engine; filled by the route
    },
    engineVersion: ENGINE_VERSION,
    catalogVersion: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
  }
}

function buildCurrentStrategy(input: GenerateStrategiesInput): RotationStrategy {
  const infoGaps: string[] = []
  let sequence = [...input.seasons].sort((a, b) => a.year - b.year).map((s) => ({ year: s.year, crop: s.crop }))

  if (sequence.length === 0) {
    const fallbackYear = new Date().getFullYear()
    sequence = [{ year: fallbackYear, crop: input.plot.currentCrop }]
    infoGaps.push('No season history available for this plot — using only the currently declared crop.')
  }

  return buildStrategy(
    'current', 'current', sequence,
    'Reconstructed from this plot\'s recorded season history.',
    infoGaps, input.catalog, input.staticProfile, input.indicators, input.priorities,
  )
}

function nextYearAfter(seasons: { year: number }[]): number {
  return seasons.length > 0 ? Math.max(...seasons.map((s) => s.year)) + 1 : new Date().getFullYear()
}

function buildAlternativeStrategies(input: GenerateStrategiesInput): RotationStrategy[] {
  const compatible = [...filterCompatibleCrops(input.plot, input.catalog)]
    .sort((a, b) => a.waterRequiredMm - b.waterRequiredMm)

  const startYear = nextYearAfter(input.seasons)
  const alternatives: RotationStrategy[] = []

  for (let i = 0; i < compatible.length - 1; i++) {
    const [cropA, cropB] = [compatible[i], compatible[i + 1]]
    const sequence = [
      { year: startYear, crop: cropA.id },
      { year: startYear + 1, crop: cropB.id },
    ]
    const id = i === 0 ? 'alt-low-water' : `alt-${cropA.id}-${cropB.id}`
    alternatives.push(buildStrategy(
      id, 'alternative', sequence,
      `Alternates ${cropA.name} and ${cropB.name}, both compatible with this plot's declared water availability.`,
      [], input.catalog, input.staticProfile, input.indicators, input.priorities,
    ))
  }

  return alternatives
}

export function generateStrategies(input: GenerateStrategiesInput): RotationStrategy[] {
  const current = buildCurrentStrategy(input)
  const alternatives = buildAlternativeStrategies(input)

  const seen = new Set<string>()
  const deduped: RotationStrategy[] = []
  for (const strategy of [current, ...alternatives]) {
    const key = JSON.stringify(strategy.sequence)
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(strategy)
    }
  }

  if (deduped.length < 3) {
    deduped[0]?.infoGaps.push(
      `Only ${deduped.length} distinct strategy(ies) could be generated from the available, water-compatible catalog entries.`,
    )
  }

  return deduped
}
