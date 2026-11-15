import type { PlotSnapshot, PlotPriorities, PlotIndicators, CropCatalogEntry } from '../../src/types/firestoreDocs'
import type { GenerateStrategiesInput } from '../../src/engines/rotation'

const CATALOG: CropCatalogEntry[] = [
  {
    id: 'corn', name: 'Grain corn', cycleDays: 120, baseTempC: 10, optimalTempC: 25, maxTempC: 35,
    waterRequiredMm: 500, fixesNitrogen: false, rootDepthCm: 100, organicMatterContribution: 'medium',
    pestRisk: ['fall armyworm'], plantingWindow: { start: '06-01', end: '07-15' }, droughtTolerance: 'low',
    source: 'INIFAP', reference: 'INIFAP corn guide', criterionType: 'documented',
  },
  {
    id: 'beans', name: 'Beans', cycleDays: 90, baseTempC: 10, optimalTempC: 22, maxTempC: 32,
    waterRequiredMm: 300, fixesNitrogen: true, rootDepthCm: 60, organicMatterContribution: 'high',
    pestRisk: ['bean weevil'], plantingWindow: { start: '06-15', end: '07-31' }, droughtTolerance: 'medium',
    source: 'INIFAP', reference: 'INIFAP bean guide', criterionType: 'documented',
  },
  {
    id: 'forage-oats', name: 'Forage oats', cycleDays: 100, baseTempC: 5, optimalTempC: 18, maxTempC: 28,
    waterRequiredMm: 350, fixesNitrogen: false, rootDepthCm: 70, organicMatterContribution: 'medium',
    pestRisk: ['aphids'], plantingWindow: { start: '08-01', end: '09-15' }, droughtTolerance: 'medium',
    source: 'FAO', reference: 'FAO GAEZ oats', criterionType: 'documented',
  },
  {
    id: 'forage-sorghum', name: 'Forage sorghum', cycleDays: 110, baseTempC: 12, optimalTempC: 28, maxTempC: 38,
    waterRequiredMm: 400, fixesNitrogen: false, rootDepthCm: 120, organicMatterContribution: 'medium',
    pestRisk: ['sorghum midge'], plantingWindow: { start: '06-01', end: '07-15' }, droughtTolerance: 'high',
    source: 'none found', reference: 'assumed', criterionType: 'assumed',
  },
]

const DEFAULT_PRIORITIES: PlotPriorities = {
  water: 3, income: 3, forage: 2, nitrogen: 2, erosion: 2, organicMatter: 2, market: 2,
}

const DEFAULT_PLOT: PlotSnapshot = {
  ownerUid: 'demo-owner', name: 'Guadalupe Victoria demo plot', center: { lat: 24.4497, lon: -104.1225 },
  areaHa: 9.6, mode: 'rainfed', currentCrop: 'corn', declaredSoilType: 'unknown', elevationM: 2000,
  country: 'Mexico', state: 'Durango', municipality: 'Guadalupe Victoria', locality: 'Guadalupe Victoria',
  powerCellId: 'power:24.375:-104.375', gpmCellId: 'gpm:24.4:-104.2', smapCellId: 'smap:24.4:-104.16',
  priorities: DEFAULT_PRIORITIES, constraints: { waterAvailability: 'low', equipment: [] },
  origin: 'demo', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

const DEFAULT_SEASONS = [
  { year: 2024, crop: 'beans' },
  { year: 2025, crop: 'corn' },
]

const DEFAULT_INDICATORS: PlotIndicators = {
  rainAccumMm: 50, rainyDays: 5, extremeRainDays: 0, maxDrySpellDays: 10,
  waterBalance5d: -5, waterBalance10d: -10, waterBalance15d: -15, waterBalance30d: -20,
  surfaceSoilMoisture: 0.2, rootZoneSoilMoisture: 0.25, moistureAnomalyPctl: 40,
  soilTempAvg7d: 20, soilTempAvg10d: 19, airTempAvg: 22, airTempMax: 30, airTempMin: 10,
  relativeHumidityAvg: 45, frostDays: 0, lastFrostDate: null, heatStressDays: 2,
  growingDegreeDaysAccum: 300, ndviAvg: 0.4, ndviDeviationVsYears: null, bareSoil: false,
  sources: ['test'], asOf: '2026-01-31', engineVersion: '1.0.0',
  rainfallProvenance: {
    source: 'test', product: 'test', version: 'v1', asOf: '2026-01-31', latencyDays: 0,
    kind: 'historical', origin: 'simulated',
  },
  moistureAnomalyProvenance: {
    source: 'test', product: 'test', version: 'v1', asOf: '2026-01-31', latencyDays: 0,
    kind: 'estimated', origin: 'simulated',
  },
}

const DEFAULT_STATIC_PROFILE = {
  slopeDegrees: 5, sandPct: 40, siltPct: 30, clayPct: 30, organicCarbon: 1.5, pH: 7, cec: 15,
  waterRetentionMm: 120,
  provenance: {
    source: 'test', product: 'test', version: 'v1', asOf: '2026-01-01', latencyDays: 0,
    kind: 'estimated' as const, origin: 'simulated' as const,
  },
}

export function demoRotationInput(
  overrides: Partial<{
    seasons: { year: number; crop: string }[]
    priorities: Partial<PlotPriorities>
  }> = {},
): GenerateStrategiesInput {
  return {
    plot: DEFAULT_PLOT,
    staticProfile: DEFAULT_STATIC_PROFILE,
    seasons: overrides.seasons ?? DEFAULT_SEASONS,
    priorities: { ...DEFAULT_PRIORITIES, ...overrides.priorities },
    indicators: DEFAULT_INDICATORS,
    catalog: CATALOG,
  }
}
