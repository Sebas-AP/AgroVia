import { describe, it, expect } from 'vitest'
import { scoreWater, scorePests, scoreModelSuccess, combineScores } from '../../../src/engines/rotation/scoring'
import type { CropCatalogEntry, PlotPriorities, PlotIndicators } from '../../../src/types/firestoreDocs'

function crop(id: string, waterRequiredMm: number): CropCatalogEntry {
  return {
    id, name: id, cycleDays: 100, baseTempC: 10, optimalTempC: 20, maxTempC: 30, waterRequiredMm,
    fixesNitrogen: false, rootDepthCm: 50, organicMatterContribution: 'medium', pestRisk: [],
    plantingWindow: { start: '06-01', end: '07-01' }, droughtTolerance: 'medium', source: 'test',
    reference: 'test', criterionType: 'assumed',
  }
}

const priorities: PlotPriorities = {
  water: 5, income: 0, forage: 0, nitrogen: 0, erosion: 0, organicMatter: 0, market: 0,
}

describe('scoreWater', () => {
  it('scores a lower water-requirement crop higher than a thirstier one, at the same priority', () => {
    const lowWater = scoreWater([crop('low', 200)], priorities)
    const highWater = scoreWater([crop('high', 800)], priorities)
    expect(lowWater).toBeGreaterThan(highWater)
  })

  it('is zero when the water priority weight is zero', () => {
    expect(scoreWater([crop('any', 200)], { ...priorities, water: 0 })).toBe(0)
  })
})

describe('scorePests', () => {
  it('penalizes a sequence that repeats the same crop in consecutive years', () => {
    const repeated = scorePests([{ crop: 'corn' }, { crop: 'corn' }])
    const rotated = scorePests([{ crop: 'corn' }, { crop: 'beans' }])
    expect(repeated).toBeLessThan(rotated)
  })
})

describe('scoreModelSuccess', () => {
  it('is undefined when no model data was supplied at all', () => {
    expect(scoreModelSuccess([{ crop: 'corn' }], undefined)).toBeUndefined()
  })

  it('is undefined when the map exists but has no entry for any crop in the sequence', () => {
    expect(scoreModelSuccess([{ crop: 'corn' }], { beans: 0.9 })).toBeUndefined()
  })

  it('scales the average probability across the sequence to a 0-100 score', () => {
    const score = scoreModelSuccess([{ crop: 'corn' }, { crop: 'beans' }], { corn: 0.8, beans: 0.4 })
    expect(score).toBeCloseTo(60, 5)
  })

  it('averages only the crops it actually has a prediction for', () => {
    const score = scoreModelSuccess([{ crop: 'corn' }, { crop: 'unknown-crop' }], { corn: 0.8 })
    expect(score).toBeCloseTo(80, 5)
  })
})

describe('combineScores', () => {
  it('returns all six score keys and a totalScore', () => {
    const indicators: PlotIndicators = {
      rainAccumMm: 0, rainyDays: 0, extremeRainDays: 0, maxDrySpellDays: 0,
      waterBalance5d: null, waterBalance10d: null, waterBalance15d: null, waterBalance30d: null,
      surfaceSoilMoisture: null, rootZoneSoilMoisture: null, moistureAnomalyPctl: null,
      soilTempAvg7d: null, soilTempAvg10d: null, airTempAvg: 20, airTempMax: 25, airTempMin: 10,
      relativeHumidityAvg: 50, frostDays: 0, lastFrostDate: null, heatStressDays: 0,
      growingDegreeDaysAccum: 0, ndviAvg: null, ndviDeviationVsYears: null, bareSoil: null,
      sources: [], asOf: '2026-01-01', engineVersion: '1.0.0',
      rainfallProvenance: null, moistureAnomalyProvenance: null,
    }
    const staticProfile = {
      slopeDegrees: 5, sandPct: 40, siltPct: 30, clayPct: 30, organicCarbon: 1.5, pH: 7, cec: 15,
      waterRetentionMm: 100,
      provenance: { source: 't', product: 't', version: 'v1', asOf: '2026-01-01', latencyDays: 0, kind: 'estimated' as const, origin: 'simulated' as const },
    }
    const { scores, totalScore } = combineScores([crop('corn', 400)], [{ crop: 'corn' }], staticProfile, indicators, priorities)
    expect(Object.keys(scores).sort()).toEqual(['climateRisk', 'economy', 'market', 'pests', 'soil', 'water'].sort())
    expect(totalScore).toBeGreaterThanOrEqual(0)
    expect(scores.modelSuccess).toBeUndefined()
  })

  it('includes modelSuccess in both the scores and the totalScore average when supplied', () => {
    const indicators: PlotIndicators = {
      rainAccumMm: 0, rainyDays: 0, extremeRainDays: 0, maxDrySpellDays: 0,
      waterBalance5d: null, waterBalance10d: null, waterBalance15d: null, waterBalance30d: null,
      surfaceSoilMoisture: null, rootZoneSoilMoisture: null, moistureAnomalyPctl: null,
      soilTempAvg7d: null, soilTempAvg10d: null, airTempAvg: 20, airTempMax: 25, airTempMin: 10,
      relativeHumidityAvg: 50, frostDays: 0, lastFrostDate: null, heatStressDays: 0,
      growingDegreeDaysAccum: 0, ndviAvg: null, ndviDeviationVsYears: null, bareSoil: null,
      sources: [], asOf: '2026-01-01', engineVersion: '1.0.0',
      rainfallProvenance: null, moistureAnomalyProvenance: null,
    }
    const staticProfile = {
      slopeDegrees: 5, sandPct: 40, siltPct: 30, clayPct: 30, organicCarbon: 1.5, pH: 7, cec: 15,
      waterRetentionMm: 100,
      provenance: { source: 't', product: 't', version: 'v1', asOf: '2026-01-01', latencyDays: 0, kind: 'estimated' as const, origin: 'simulated' as const },
    }
    const { scores, totalScore } = combineScores(
      [crop('corn', 400)], [{ crop: 'corn' }], staticProfile, indicators, priorities, { corn: 1.0 },
    )
    expect(scores.modelSuccess).toBe(100)
    const expectedTotal = (scores.water + scores.soil + scores.climateRisk + scores.pests + scores.economy + scores.market + 100) / 7
    expect(totalScore).toBeCloseTo(expectedTotal, 10)
  })
})
