import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type {
  PlotSnapshot, PlotPriorities, PlotIndicators, CropCatalogEntry,
} from '../../types/firestoreDocs'
import type { RotationStrategy } from '../../types/strategy'
import { filterCompatibleCrops } from './filters'
import { combineScores } from './scoring'

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../package.json')
const ENGINE_VERSION = (JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string }).version

// A fingerprint of the exact catalog array used for this call, not a constant — so two calls
// against different catalog content never claim the same catalogVersion (defect (h)).
function computeCatalogVersion(catalog: CropCatalogEntry[]): string {
  const fingerprint = [...catalog]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}:${c.criterionType}:${c.source}:${c.waterRequiredMm}:${c.droughtTolerance}`)
    .join('|')
  return createHash('sha1').update(fingerprint).digest('hex').slice(0, 12)
}

const DEFAULT_MAX_ALTERNATIVES = 5

export interface GenerateStrategiesInput {
  plot: PlotSnapshot
  seasons: { year: number; crop: string }[]
  priorities: PlotPriorities
  indicators: PlotIndicators
  catalog: CropCatalogEntry[]
  // Caps the O(n^2) pairwise alternatives generated from the compatible-crop list, keeping the
  // best `maxAlternatives` by totalScore (defect (e)). Default 5.
  maxAlternatives?: number
  // Modelo-predicted harvest-success probability per Backend crop id (routes/plots.ts resolves
  // this over HTTP before calling generateStrategies — this module stays a pure, synchronous
  // function). Absent entirely when Modelo wasn't reachable; per-crop entries are only present
  // for crops the model actually answered for.
  modelSuccessByCrop?: Record<string, number>
  modelInfo?: { name: string; version: string }
  // Set when Modelo was reachable in general but produced no usable modelSuccessByCrop at all —
  // recorded in every strategy's infoGaps rather than silently dropping the criterion.
  modelUnavailableReason?: string
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

function buildBenefits(
  crops: CropCatalogEntry[],
  waterAvailability: PlotSnapshot['constraints']['waterAvailability'],
): string[] {
  const benefits: string[] = []
  if (crops.some((c) => c.fixesNitrogen)) {
    benefits.push('Includes a nitrogen-fixing crop, reducing the fertilizer this rotation needs.')
  }
  if (crops.some((c) => c.organicMatterContribution === 'high')) {
    benefits.push('Includes a crop with a high organic-matter contribution, improving soil structure over time.')
  }
  // Only claimed when the plot's own declared water availability is actually low — a
  // drought-tolerant crop isn't a benefit worth naming on a plot with plenty of water (defect (g)).
  if (waterAvailability === 'low' && crops.some((c) => c.droughtTolerance === 'high')) {
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

// Provenance comes from the real climate/soil-moisture sources the indicators engine actually
// used (indicators.rainfallProvenance / .moistureAnomalyProvenance), not a fixed
// 'estimated'/'simulated' constant — so it reads 'real' once real providers are wired in, and
// stays honest (an infoGap, not a fabricated origin) when a period genuinely has no data (defect (f)).
function buildIndicatorEvidence(indicators: PlotIndicators, infoGaps: string[]): RotationStrategy['evidence'] {
  const evidence: RotationStrategy['evidence'] = []

  if (indicators.rainfallProvenance) {
    evidence.push({
      label: 'Accumulated rainfall', value: String(indicators.rainAccumMm), unit: 'mm',
      period: indicators.asOf, provenance: indicators.rainfallProvenance,
    })
  } else {
    infoGaps.push('No climate source provenance available for the accumulated-rainfall figure.')
  }

  if (indicators.moistureAnomalyProvenance && indicators.moistureAnomalyPctl !== null) {
    evidence.push({
      label: 'Root-zone moisture anomaly', value: String(indicators.moistureAnomalyPctl), unit: 'percentile',
      period: indicators.asOf, provenance: indicators.moistureAnomalyProvenance,
    })
  } else if (indicators.moistureAnomalyProvenance) {
    infoGaps.push(
      'Root-zone moisture percentile is unavailable: no real historical climatology baseline ' +
      'is connected yet, so the percentile was not estimated.',
    )
  } else {
    infoGaps.push('No soil-moisture source provenance available for the moisture-anomaly figure.')
  }

  return evidence
}

interface ModelContext {
  successByCrop?: Record<string, number>
  info?: { name: string; version: string }
  unavailableReason?: string
}

function buildStrategy(
  id: string,
  type: RotationStrategy['type'],
  sequence: { year: number; crop: string }[],
  rationale: string,
  infoGaps: string[],
  catalog: CropCatalogEntry[],
  indicators: PlotIndicators,
  priorities: PlotPriorities,
  waterAvailability: PlotSnapshot['constraints']['waterAvailability'],
  model: ModelContext,
): RotationStrategy {
  const crops = lookupCrops(sequence.map((s) => s.crop), catalog, infoGaps)
  if (crops.length === 0) {
    infoGaps.push('No crop in this sequence matched the catalog — the water/soil scores below are not meaningful (shown as 0).')
  }
  const { scores, totalScore } = combineScores(
    crops, sequence, indicators, priorities, model.successByCrop,
  )
  // The static soil profile (and its slope) is not connected; this is a permanent gap of the
  // soil criterion in this build, recorded on every strategy rather than hidden.
  infoGaps.push(
    'Slope is unavailable, so erosion protection is not part of the soil score; ' +
    'the soil criterion uses nitrogen fixation and organic-matter contribution only.',
  )
  const evidence = buildIndicatorEvidence(indicators, infoGaps)
  if (scores.modelSuccess !== undefined && model.info) {
    evidence.push({
      label: 'Modelo-predicted harvest-success probability',
      value: String(Math.round(scores.modelSuccess) / 100),
      unit: 'probability',
      period: indicators.asOf,
      provenance: {
        source: 'modelo-agrovia', product: model.info.name, version: model.info.version,
        asOf: indicators.asOf, latencyDays: 0, kind: 'estimated', origin: 'real',
      },
    })
  } else if (model.unavailableReason) {
    infoGaps.push(`modelSuccess criterion omitted: ${model.unavailableReason}`)
  }
  const sequenceText = sequence.map((s) => `${s.crop} (${s.year})`).join(' -> ')

  return {
    id,
    type,
    sequence,
    rationale,
    evidence,
    benefits: buildBenefits(crops, waterAvailability),
    // Price-based evidence/economics are filled by the rotations route (Task 10), which also has
    // the economics engine (Task 9) and the farmer's real business inputs — neither is available
    // at this layer. summary.avgMarginPct/avgProfitMxn are likewise filled there once economics exist.
    economics: [],
    infoGaps,
    risks: buildRisks(crops, indicators),
    scores,
    totalScore,
    summary: {
      sequenceText,
      shortRationale: rationale.slice(0, 120),
      avgMarginPct: null,
      avgProfitMxn: null,
    },
    engineVersion: ENGINE_VERSION,
    catalogVersion: computeCatalogVersion(catalog),
    generatedAt: new Date().toISOString(),
  }
}

function modelContextFrom(input: GenerateStrategiesInput): ModelContext {
  return {
    successByCrop: input.modelSuccessByCrop,
    info: input.modelInfo,
    unavailableReason: input.modelSuccessByCrop === undefined ? input.modelUnavailableReason : undefined,
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
    infoGaps, input.catalog, input.indicators, input.priorities,
    input.plot.constraints.waterAvailability, modelContextFrom(input),
  )
}

function nextYearAfter(seasons: { year: number }[]): number {
  return seasons.length > 0 ? Math.max(...seasons.map((s) => s.year)) + 1 : new Date().getFullYear()
}

function buildAlternativeStrategies(input: GenerateStrategiesInput): RotationStrategy[] {
  const compatible = [...filterCompatibleCrops(input.plot, input.catalog)]
    .sort((a, b) => a.waterRequiredMm - b.waterRequiredMm)

  const startYear = nextYearAfter(input.seasons)
  const candidates: RotationStrategy[] = []

  // Every distinct pair of compatible crops, not just adjacent ones in the water-sorted list —
  // with only 2-3 candidates typical for this plot, adjacent-only pairing left the alternative
  // pool too thin (and made sequence collisions structurally impossible to exercise). This is
  // O(n^2) in the compatible-crop count, so the candidate pool is capped below (defect (e)).
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
      candidates.push(buildStrategy(
        id, 'alternative', sequence,
        `Alternates ${cropA.name} and ${cropB.name}, both compatible with this plot's declared water availability.`,
        [], input.catalog, input.indicators, input.priorities,
        input.plot.constraints.waterAvailability, modelContextFrom(input),
      ))
    }
  }

  const maxAlternatives = input.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES
  const kept = [...candidates].sort((a, b) => b.totalScore - a.totalScore).slice(0, maxAlternatives)
  const discarded = candidates.length - kept.length
  if (discarded > 0) {
    kept[0]?.infoGaps.push(
      `${discarded} additional alternative(s) were generated from the compatible-crop catalog but ` +
      `discarded to keep only the top ${maxAlternatives} by score.`,
    )
  }

  return kept
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
