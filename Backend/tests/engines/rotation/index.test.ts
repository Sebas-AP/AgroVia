import { describe, it, expect } from 'vitest'
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
})
