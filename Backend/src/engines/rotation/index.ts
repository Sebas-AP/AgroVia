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

function buildBenefits(crops: CropCatalogEntry[]): string[] {
  const benefits: string[] = []
  if (crops.some((c) => c.fixesNitrogen)) {
    benefits.push('Includes a nitrogen-fixing crop, reducing the fertilizer this rotation needs.')
  }
  if (crops.some((c) => c.organicMatterContribution === 'high')) {
    benefits.push('Includes a crop with a high organic-matter contribution, improving soil structure over time.')
  }
  if (crops.some((c) => c.droughtTolerance === 'high')) {
    benefits.push('Includes a drought-tolerant crop, a good match for this plot\'s low declared water availability.')
  }
  return benefits
}

function buildRisks(crops: CropCatalogEntry[], indicators: PlotIndicators): string[] {
  const risks: string[] = []
  for (const crop of crops) {
    for (const pest of crop.pestRisk) {
      risks.push(`${crop.name}: watch for ${pest}.`)
    }
  }
  if (indicators.frostDays > 0) {
    risks.push(`${indicators.frostDays} frost day(s) recorded this period — review cold-sensitive crops in this sequence.`)
  }
  if (indicators.heatStressDays > 0) {
    risks.push(`${indicators.heatStressDays} heat-stress day(s) recorded this period — review heat-sensitive crops in this sequence.`)
  }
  return risks
}

function buildIndicatorEvidence(indicators: PlotIndicators): RotationStrategy['evidence'] {
  const asOf = indicators.asOf
  const provenanceFor = (label: string): RotationStrategy['evidence'][number] => ({
    label,
    value: '', // filled below per field
    unit: '',
    period: asOf,
    provenance: {
      source: indicators.sources[0] ?? 'indicators engine', product: 'monthly indicators',
      version: indicators.engineVersion, asOf, latencyDays: 0, kind: 'estimated', origin: 'simulated',
    },
  })
  return [
    { ...provenanceFor('Accumulated rainfall'), value: String(indicators.rainAccumMm), unit: 'mm' },
    {
      ...provenanceFor('Root-zone moisture anomaly'),
      value: indicators.moistureAnomalyPctl === null ? 'unknown' : String(indicators.moistureAnomalyPctl),
      unit: 'percentile',
    },
  ]
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
  if (crops.length === 0) {
    infoGaps.push('No crop in this sequence matched the catalog — the water/soil scores below are not meaningful (shown as 0).')
  }
  const { scores, totalScore } = combineScores(crops, sequence, staticProfile, indicators, priorities)
  const sequenceText = sequence.map((s) => `${s.crop} (${s.year})`).join(' -> ')

  return {
    id,
    type,
    sequence,
    rationale,
    evidence: buildIndicatorEvidence(indicators),
    benefits: buildBenefits(crops),
    // Price-based evidence/economics are filled by the rotations route (Task 10), which also has
    // the economics engine (Task 9) and the farmer's real business inputs — neither is available
    // at this layer. summary.avgMargin is likewise filled there once economics exist.
    economics: [],
    infoGaps,
    risks: buildRisks(crops, indicators),
    scores,
    totalScore,
    summary: {
      sequenceText,
      shortRationale: rationale.slice(0, 120),
      avgMargin: 0,
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

  // Every distinct pair of compatible crops, not just adjacent ones in the water-sorted list —
  // with only 2-3 candidates typical for this plot, adjacent-only pairing left the alternative
  // pool too thin (and made sequence collisions structurally impossible to exercise).
  let isFirstPair = true
  for (let i = 0; i < compatible.length - 1; i++) {
    for (let j = i + 1; j < compatible.length; j++) {
      const [cropA, cropB] = [compatible[i], compatible[j]]
      const sequence = [
        { year: startYear, crop: cropA.id },
        { year: startYear + 1, crop: cropB.id },
      ]
      const id = isFirstPair ? 'alt-low-water' : `alt-${cropA.id}-${cropB.id}`
      isFirstPair = false
      alternatives.push(buildStrategy(
        id, 'alternative', sequence,
        `Alternates ${cropA.name} and ${cropB.name}, both compatible with this plot's declared water availability.`,
        [], input.catalog, input.staticProfile, input.indicators, input.priorities,
      ))
    }
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
