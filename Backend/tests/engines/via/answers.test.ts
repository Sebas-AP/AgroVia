import { describe, it, expect } from 'vitest'
import { buildViaAnswer } from '../../../src/engines/via'
import { findUnsupportedNumbers } from '../../../src/engines/via/verification'
import type { PlotIndicators, PlotSnapshot } from '../../../src/types/firestoreDocs'
import type { RotationStrategy } from '../../../src/types/strategy'
import type { BusinessInputs } from '../../../src/types/business'
import type { PriceSnapshot } from '../../../src/providers/PricesProvider'
import type { Provenance } from '../../../src/types/provenance'

const CLIMATE_PROVENANCE: Provenance = {
  source: 'NASA POWER (simulated)', product: 'AG community daily', version: 'sim-1',
  asOf: '2026-11-01', latencyDays: 0, kind: 'historical', origin: 'simulated',
}
const SOIL_PROVENANCE: Provenance = {
  source: 'SMAP SPL4SMGP (simulated)', product: 'v8', version: 'sim-1',
  asOf: '2026-11-01', latencyDays: 0, kind: 'satelliteObservation', origin: 'simulated',
}
const NDVI_PROVENANCE: Provenance = {
  source: 'MODIS MOD13Q1 (simulated)', product: 'NDVI/EVI', version: 'sim-1',
  asOf: '2026-11-01', latencyDays: 0, kind: 'satelliteObservation', origin: 'simulated',
}

const PLOT: PlotSnapshot = {
  ownerUid: 'demo-owner',
  name: 'Guadalupe Victoria demo plot',
  center: { lat: 24.4497, lon: -104.1225 },
  polygon: [
    { lat: 24.448307, lon: -104.12403 },
    { lat: 24.448307, lon: -104.12097 },
    { lat: 24.451093, lon: -104.12097 },
    { lat: 24.451093, lon: -104.12403 },
  ],
  areaHa: 9.6,
  mode: 'rainfed',
  currentCrop: 'corn',
  declaredSoilType: 'unknown',
  elevationM: 2000,
  country: 'Mexico',
  state: 'Durango',
  municipality: 'Guadalupe Victoria',
  locality: 'Guadalupe Victoria',
  powerCellId: 'power:24.0:-104.375',
  gpmCellId: 'gpm:24.4:-104.2',
  smapCellId: 'smap:24.4:-104.16',
  priorities: { water: 3, income: 3, forage: 2, nitrogen: 2, erosion: 2, organicMatter: 2, market: 2 },
  constraints: { waterAvailability: 'low', equipment: [] },
  origin: 'demo',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const INDICATORS: PlotIndicators = {
  rainAccumMm: 12.4,
  rainyDays: 3,
  extremeRainDays: 1,
  maxDrySpellDays: 6,
  waterBalance5d: -2.5,
  waterBalance10d: -4.2,
  waterBalance15d: null,
  waterBalance30d: -8.1,
  surfaceSoilMoisture: 0.18,
  rootZoneSoilMoisture: 0.22,
  moistureAnomalyPctl: 35,
  soilTempAvg7d: 18.2,
  soilTempAvg10d: 17.9,
  airTempAvg: 21.3,
  airTempMax: 28.4,
  airTempMin: 4.2,
  relativeHumidityAvg: 45,
  frostDays: 2,
  lastFrostDate: '2026-11-05',
  heatStressDays: 0,
  growingDegreeDaysAccum: 112.5,
  ndviAvg: 0.43,
  ndviDeviationVsYears: null,
  bareSoil: false,
  sources: ['test'],
  rainfallProvenance: CLIMATE_PROVENANCE,
  moistureAnomalyProvenance: SOIL_PROVENANCE,
  ndviProvenance: NDVI_PROVENANCE,
  asOf: '2026-11-01',
  engineVersion: '1.0.0',
}

const STRATEGY: RotationStrategy = {
  id: 'current',
  type: 'current',
  sequence: [{ year: 2025, crop: 'corn' }, { year: 2026, crop: 'beans' }],
  rationale: 'Reconstructed from recorded seasons.',
  evidence: [
    {
      label: 'Accumulated rainfall', value: '12.4', unit: 'mm', period: '2026-11-01',
      provenance: CLIMATE_PROVENANCE,
    },
    {
      label: 'Rural average price', value: '5.2', unit: 'MXN/kg', period: '2026-11-01',
      provenance: {
        source: 'SIAP/SNIIM (simulated)', product: 'rural average + wholesale price', version: 'sim-1',
        asOf: '2026-11-01', latencyDays: 0, kind: 'estimated', origin: 'simulated',
      },
    },
  ],
  benefits: [],
  economics: [],
  infoGaps: ['Simulated default costs were used for this crop.'],
  risks: [],
  scores: { water: 60, soil: 55, climateRisk: 90, pests: 100, economy: 50, market: 50 },
  totalScore: 67.84,
  summary: {
    sequenceText: 'corn (2025) -> beans (2026)', shortRationale: 'Reconstructed',
    avgMarginPct: 12.3, avgProfitMxn: 4200,
  },
  engineVersion: '1.0.0',
  catalogVersion: 'abc123',
  generatedAt: '2026-11-14T10:00:00.000Z',
}

const BUSINESS: BusinessInputs = {
  crop: 'corn', area: 9.6, seed: 480, fertilizer: 770, water: 190, labor: 960,
  machinery: 575, transport: 290, other: 95, yieldTonHa: 3.2, priceTon: 4200,
}

const PRICE: PriceSnapshot = {
  ruralAvgPriceKg: 5.2,
  wholesalePriceKg: 6.1,
  guaranteedPriceTon: 5460,
  yieldTonHa: 3.3,
  provenance: {
    source: 'SIAP/SNIIM (simulated)', product: 'rural average + wholesale price', version: 'sim-1',
    asOf: '2026-11-01', latencyDays: 0, kind: 'estimated', origin: 'simulated',
  },
  infoGaps: [],
}

function expectGrounded(answer: ReturnType<typeof buildViaAnswer>): void {
  expect(answer.answer.length).toBeGreaterThan(0)
  expect(findUnsupportedNumbers(answer.answer, answer.evidence)).toEqual([])
}

describe('buildViaAnswer', () => {
  it('answers rainfall questions only with figures backed by climate evidence', () => {
    const answer = buildViaAnswer('water', { plot: PLOT, indicators: INDICATORS })
    expectGrounded(answer)
    expect(answer.answer).toContain('12.4 mm')
    expect(answer.evidence.every((item) => item.provenance === CLIMATE_PROVENANCE)).toBe(true)
  })

  it('answers soil-moisture questions with soil evidence', () => {
    const answer = buildViaAnswer('soilMoisture', { plot: PLOT, indicators: INDICATORS })
    expectGrounded(answer)
    expect(answer.answer).toContain('0.18')
    expect(answer.evidence.every((item) => item.provenance === SOIL_PROVENANCE)).toBe(true)
  })

  it('answers temperature and frost questions with climate evidence', () => {
    const answer = buildViaAnswer('temperature', { plot: PLOT, indicators: INDICATORS })
    expectGrounded(answer)
    expect(answer.answer).toContain('21.3')
    expect(answer.answer).toMatch(/frost days/)
  })

  it('answers NDVI questions with NDVI evidence', () => {
    const answer = buildViaAnswer('ndvi', { plot: PLOT, indicators: INDICATORS })
    expectGrounded(answer)
    expect(answer.answer).toContain('0.43')
    expect(answer.evidence.every((item) => item.provenance === NDVI_PROVENANCE)).toBe(true)
  })

  it('answers strategy questions from the stored batch evidence', () => {
    const answer = buildViaAnswer('strategies', { plot: PLOT, strategies: [STRATEGY] })
    expectGrounded(answer)
    expect(answer.answer).toContain('67.84')
    expect(answer.evidence.some((item) => item.label === 'Accumulated rainfall')).toBe(true)
    expect(answer.infoGaps).toContain('Simulated default costs were used for this crop.')
  })

  it('answers economics questions from recorded business data only', () => {
    const answer = buildViaAnswer('economics', { plot: PLOT, business: BUSINESS })
    expectGrounded(answer)
    expect(answer.answer).toContain('MXN')
    expect(answer.evidence.every((item) => item.provenance.kind === 'recorded')).toBe(true)
  })

  it('answers market questions and labels simulated prices as simulated', () => {
    const answer = buildViaAnswer('market', { plot: PLOT, price: PRICE })
    expectGrounded(answer)
    expect(answer.answer).toContain('simulated')
    expect(answer.evidence.every((item) => item.provenance.origin === 'simulated')).toBe(true)
  })

  it('answers plot questions with recorded plot facts and the polygon surface', () => {
    const answer = buildViaAnswer('plot', { plot: PLOT })
    expectGrounded(answer)
    expect(answer.answer).toContain('24.4497')
    expect(answer.evidence.some((item) => item.label === 'Stored polygon surface')).toBe(true)
  })

  it('refuses to invent figures when the underlying data is absent', () => {
    const noClimate = buildViaAnswer('water', {
      plot: PLOT,
      indicators: { ...INDICATORS, rainfallProvenance: null },
    })
    expectGrounded(noClimate)
    expect(noClimate.evidence).toEqual([])
    expect(noClimate.infoGaps.join(' ')).toMatch(/No climate provenance/)

    const noBusiness = buildViaAnswer('economics', { plot: PLOT, business: null })
    expectGrounded(noBusiness)
    expect(noBusiness.evidence).toEqual([])
    expect(noBusiness.infoGaps.join(' ')).toMatch(/business\/current record/)

    const noStrategies = buildViaAnswer('strategies', { plot: PLOT, strategies: [] })
    expectGrounded(noStrategies)
    expect(noStrategies.evidence).toEqual([])
  })

  it('answers an unmatched question without fabricating figures', () => {
    const answer = buildViaAnswer('unknown', { plot: PLOT })
    expectGrounded(answer)
    expect(answer.evidence).toEqual([])
    expect(answer.answer).toMatch(/I can answer/)
  })
})
