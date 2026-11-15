import { describe, it, expect } from 'vitest'
import { resolveDataMode, simulatedModeWarning } from '../../src/config/dataMode'

describe('resolveDataMode', () => {
  it('uses real providers by default when MODELO_BASE_URL is configured', () => {
    expect(resolveDataMode({ MODELO_BASE_URL: 'http://modelo.test' })).toBe('real')
  })

  it('falls back to simulated when MODELO_BASE_URL is absent', () => {
    expect(resolveDataMode({})).toBe('simulated')
  })

  it('lets an explicit USE_SIMULATED_PROVIDERS=true override a configured Modelo URL', () => {
    expect(resolveDataMode({
      MODELO_BASE_URL: 'http://modelo.test', USE_SIMULATED_PROVIDERS: 'true',
    })).toBe('simulated')
  })

  it('does not treat any other USE_SIMULATED_PROVIDERS value as an opt-in', () => {
    expect(resolveDataMode({
      MODELO_BASE_URL: 'http://modelo.test', USE_SIMULATED_PROVIDERS: 'false',
    })).toBe('real')
  })
})

describe('simulatedModeWarning', () => {
  it('is silent in real mode', () => {
    expect(simulatedModeWarning({ MODELO_BASE_URL: 'http://modelo.test' })).toBeNull()
  })

  it('names the missing variable when the fallback is accidental', () => {
    expect(simulatedModeWarning({})).toMatch(/MODELO_BASE_URL is not set/)
  })

  it('names the explicit opt-in when the fallback is deliberate', () => {
    expect(simulatedModeWarning({
      MODELO_BASE_URL: 'http://modelo.test', USE_SIMULATED_PROVIDERS: 'true',
    })).toMatch(/USE_SIMULATED_PROVIDERS=true/)
  })
})
