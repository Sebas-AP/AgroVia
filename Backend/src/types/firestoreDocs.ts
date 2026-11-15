import type { Provenance } from './provenance'

export interface PlotPriorities {
  water: number
  income: number
  forage: number
  nitrogen: number
  erosion: number
  organicMatter: number
  market: number
}

export interface PlotSnapshot {
  ownerUid: string
  name: string
  center: { lat: number; lon: number }
  areaHa: number
  mode: 'rainfed' | 'irrigated'
  currentCrop: string
  declaredSoilType: string
  elevationM: number
  country: string
  state: string
  municipality: string
  locality: string
  powerCellId: string
  gpmCellId: string
  smapCellId: string
  priorities: PlotPriorities
  constraints: { waterAvailability: 'low' | 'medium' | 'high'; equipment: string[] }
  origin: 'real' | 'demo'
  createdAt: string
  updatedAt: string
  // Not yet collected from the farmer anywhere in this build — optional until a form field
  // exists for them. Needed only by the Modelo integration mapper
  // (integration/modeloMapper.ts), which throws a clear error rather than inventing a value
  // when either is missing for a plot it's asked to map.
  terrainType?: string
  growthStage?: string
}

export interface StrategyScores {
  water: number
  soil: number
  climateRisk: number
  pests: number
  economy: number
  market: number
}

export interface PlotIndicators {
  rainAccumMm: number
  rainyDays: number
  extremeRainDays: number
  maxDrySpellDays: number
  waterBalance5d: number | null
  waterBalance10d: number | null
  waterBalance15d: number | null
  waterBalance30d: number | null
  surfaceSoilMoisture: number | null
  rootZoneSoilMoisture: number | null
  moistureAnomalyPctl: number | null
  soilTempAvg7d: number | null
  soilTempAvg10d: number | null
  airTempAvg: number | null
  airTempMax: number | null
  airTempMin: number | null
  relativeHumidityAvg: number | null
  frostDays: number
  lastFrostDate: string | null
  heatStressDays: number
  growingDegreeDaysAccum: number
  ndviAvg: number | null
  ndviDeviationVsYears: number | null
  bareSoil: boolean | null
  sources: string[]
  // The specific provenance behind the two rotation-engine evidence figures that read from
  // indicators (accumulated rainfall, moisture anomaly) — null only when that period genuinely
  // has no climate/soil-moisture data at all, never a fabricated fallback (defect (f)).
  rainfallProvenance: Provenance | null
  moistureAnomalyProvenance: Provenance | null
  asOf: string
  engineVersion: string
}

export interface CropCatalogEntry {
  id: string
  name: string
  cycleDays: number
  baseTempC: number
  optimalTempC: number
  maxTempC: number
  waterRequiredMm: number
  fixesNitrogen: boolean
  rootDepthCm: number
  organicMatterContribution: 'low' | 'medium' | 'high'
  pestRisk: string[]
  plantingWindow: { start: string; end: string }
  droughtTolerance: 'low' | 'medium' | 'high'
  source: string
  reference: string
  criterionType: 'documented' | 'assumed'
}
