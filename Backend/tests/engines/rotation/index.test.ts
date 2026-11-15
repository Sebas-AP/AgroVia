import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { generateStrategies } from '../../../src/engines/rotation'
import { demoRotationInput } from '../../fixtures/demoRotationInput'

describe('generateStrategies', () => {
  it('always returns at least 3 strategies including the current one', () => {
    const strategies = generateStrategies(demoRotationInput())
    expect(strategies.length).toBeGreaterThanOrEqual(3)
    expect(strategies.some((s) => s.type === 'current')).toBe(true)
  })

  it('builds the current strategy from seasons history when present', () => {
    const strategies = generateStrategies(demoRotationInput())
    const current = strategies.find((s) => s.type === 'current')!
    expect(current.sequence.map((s) => s.crop)).toEqual(['beans', 'corn'])
  })

  it('falls back to the plot currentCrop and flags the gap when seasons is empty', () => {
    const input = demoRotationInput({ seasons: [] })
    const strategies = generateStrategies(input)
    const current = strategies.find((s) => s.type === 'current')!
    expect(current.infoGaps.length).toBeGreaterThan(0)
  })

  it('never returns two alternatives with the same sequence', () => {
    const strategies = generateStrategies(demoRotationInput())
    const sequenceKeys = strategies.map((s) => JSON.stringify(s.sequence))
    expect(new Set(sequenceKeys).size).toBe(sequenceKeys.length)
  })

  it('skips a crop missing from the catalog instead of throwing, and records the gap', () => {
    const input = demoRotationInput({ seasons: [{ year: 2025, crop: 'unknown-crop' }] })
    expect(() => generateStrategies(input)).not.toThrow()
    const current = generateStrategies(input).find((s) => s.type === 'current')!
    expect(current.infoGaps.join(' ')).toMatch(/unknown-crop/)
  })

  it('raising the water priority weight raises the score of low-water strategies', () => {
    const lowWaterPriority = generateStrategies(demoRotationInput({ priorities: { water: 5 } }))
    const highWaterPriority = generateStrategies(demoRotationInput({ priorities: { water: 0 } }))
    const lowWaterStrategy = (s: typeof lowWaterPriority) => s.find((x) => x.id === 'alt-low-water')!
    expect(lowWaterStrategy(lowWaterPriority).scores.water)
      .toBeGreaterThan(lowWaterStrategy(highWaterPriority).scores.water)
  })

  it('fills benefits and risks for a strategy whose crops are in the catalog', () => {
    const strategies = generateStrategies(demoRotationInput())
    const alternative = strategies.find((s) => s.type === 'alternative')!
    expect(alternative.benefits.length).toBeGreaterThan(0)
    expect(alternative.risks.length).toBeGreaterThan(0)
  })

  it('flags unreliable scores when no crop in the sequence matched the catalog', () => {
    const input = demoRotationInput({ seasons: [{ year: 2025, crop: 'unknown-crop' }] })
    const current = generateStrategies(input).find((s) => s.type === 'current')!
    expect(current.infoGaps.join(' ')).toMatch(/score/i)
  })

  it('generates alternatives from every compatible pair, not just adjacent ones', () => {
    // 3 compatible crops (corn is excluded under low water availability) means 3 distinct
    // pairs, not 2 — this plot should see current + 3 alternatives.
    const strategies = generateStrategies(demoRotationInput())
    expect(strategies.filter((s) => s.type === 'alternative').length).toBe(3)
  })

  it('caps the number of generated alternatives at maxAlternatives and records how many were discarded', () => {
    // 6 mutually-compatible crops -> C(6,2) = 15 candidate pairs, well past any reasonable cap.
    const manyCrops = Array.from({ length: 6 }, (_, i) => ({
      id: `crop-${i}`, name: `Crop ${i}`, cycleDays: 100, baseTempC: 10, optimalTempC: 20, maxTempC: 30,
      waterRequiredMm: 300 + i * 10, fixesNitrogen: false, rootDepthCm: 50,
      organicMatterContribution: 'medium' as const, pestRisk: [],
      plantingWindow: { start: '06-01', end: '07-01' }, droughtTolerance: 'medium' as const,
      source: 'test', reference: 'test', criterionType: 'assumed' as const,
    }))
    const input = demoRotationInput({ seasons: [] })
    const strategies = generateStrategies({ ...input, catalog: manyCrops, maxAlternatives: 4 })
    const alternatives = strategies.filter((s) => s.type === 'alternative')
    expect(alternatives.length).toBe(4)
    expect(strategies.flatMap((s) => s.infoGaps).join(' ')).toMatch(/11 additional alternative/)
  })

  it('derives catalogVersion from the catalog actually passed in, not a constant', () => {
    const withOneCatalog = generateStrategies(demoRotationInput())
    const differentCatalog = generateStrategies({
      ...demoRotationInput(), catalog: [{
        id: 'only-crop', name: 'Only crop', cycleDays: 1, baseTempC: 1, optimalTempC: 1, maxTempC: 1,
        waterRequiredMm: 1, fixesNitrogen: false, rootDepthCm: 1, organicMatterContribution: 'low',
        pestRisk: [], plantingWindow: { start: '01-01', end: '01-02' }, droughtTolerance: 'low',
        source: 'test', reference: 'test', criterionType: 'assumed',
      }],
    })
    expect(withOneCatalog[0].catalogVersion).not.toBe(differentCatalog[0].catalogVersion)
  })

  it('stamps engineVersion from package.json rather than a hardcoded literal', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8')) as { version: string }
    const strategies = generateStrategies(demoRotationInput())
    expect(strategies[0].engineVersion).toBe(pkg.version)
  })

  it("names a benefit for drought tolerance only when the plot's water availability is actually low", () => {
    const lowWater = generateStrategies(demoRotationInput())
    const alt = lowWater.find((s) => s.type === 'alternative' && s.sequence.some((c) => c.crop === 'forage-sorghum'))!
    expect(alt.benefits.join(' ')).toMatch(/drought-tolerant/)

    const highWater = generateStrategies({
      ...demoRotationInput(),
      // maxAlternatives high enough that none of the (now larger, corn-included) candidate pool
      // gets discarded by the score cap — this test is about the water-availability condition,
      // not about capping.
      maxAlternatives: 10,
      plot: { ...demoRotationInput().plot, constraints: { waterAvailability: 'high', equipment: [] } },
    })
    const altHighWater = highWater.find((s) => s.type === 'alternative' && s.sequence.some((c) => c.crop === 'forage-sorghum'))!
    expect(altHighWater.benefits.join(' ')).not.toMatch(/drought-tolerant/)
  })

  it('adds a modelSuccess score and a modelo-agrovia evidence entry when model predictions are supplied', () => {
    const input = demoRotationInput()
    const strategies = generateStrategies({
      ...input,
      modelSuccessByCrop: { corn: 0.8, beans: 0.6, 'forage-oats': 0.5, 'forage-sorghum': 0.5 },
      modelInfo: { name: 'modelo-agrovia', version: 'modelo_agrovia.joblib' },
    })
    for (const strategy of strategies) {
      expect(strategy.scores.modelSuccess).toBeGreaterThan(0)
      const evidence = strategy.evidence.find((e) => e.provenance.source === 'modelo-agrovia')
      expect(evidence).toBeDefined()
      expect(evidence!.provenance.version).toBe('modelo_agrovia.joblib')
    }
  })

  it('keeps generating every strategy, with modelSuccess omitted and the gap recorded, when Modelo is down', () => {
    const input = demoRotationInput()
    const strategies = generateStrategies({
      ...input,
      modelUnavailableReason: 'Modelo did not respond: ECONNREFUSED',
    })
    expect(strategies.length).toBeGreaterThanOrEqual(3)
    for (const strategy of strategies) {
      expect(strategy.scores.modelSuccess).toBeUndefined()
      expect(strategy.evidence.some((e) => e.provenance.source === 'modelo-agrovia')).toBe(false)
      expect(strategy.infoGaps.join(' ')).toMatch(/modelSuccess criterion omitted.*ECONNREFUSED/)
    }
  })

  it('records an infoGap instead of fabricating evidence when a period has no climate/soil-moisture provenance', () => {
    const input = demoRotationInput()
    const strategies = generateStrategies({
      ...input,
      indicators: { ...input.indicators, rainfallProvenance: null, moistureAnomalyProvenance: null },
    })
    const current = strategies.find((s) => s.type === 'current')!
    expect(current.evidence.some((e) => e.label === 'Accumulated rainfall')).toBe(false)
    expect(current.evidence.some((e) => e.label === 'Root-zone moisture anomaly')).toBe(false)
    expect(current.infoGaps.join(' ')).toMatch(/no climate source provenance/i)
    expect(current.infoGaps.join(' ')).toMatch(/no soil-moisture source provenance/i)
  })
})
