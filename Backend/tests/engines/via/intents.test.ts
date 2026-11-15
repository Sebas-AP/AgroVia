import { describe, it, expect } from 'vitest'
import { classifyIntent } from '../../../src/engines/via/intents'

const CASES: [string, string][] = [
  ['¿Va a llover mañana?', 'water'],
  ['¿Cuánta precipitación cayó este mes?', 'water'],
  ['¿Cuánta agua hay en el suelo?', 'soilMoisture'],
  ['¿Cómo está la humedad del suelo?', 'soilMoisture'],
  ['¿Hay riesgo de helada?', 'temperature'],
  ['¿Cuántos grados día se acumularon?', 'temperature'],
  ['¿Cómo está el NDVI de la parcela?', 'ndvi'],
  ['¿Qué me dice el satélite de la vegetación?', 'ndvi'],
  ['¿Qué rotación me recomiendas?', 'strategies'],
  ['¿Qué debo sembrar el año que viene?', 'strategies'],
  ['¿Cuál es mi margen de ganancia?', 'economics'],
  ['¿Cuánto invertí en fertilizante?', 'economics'],
  ['¿A cómo está el precio del maíz?', 'market'],
  ['¿Cuántas hectáreas tiene mi parcela?', 'plot'],
  ['¿Dónde está ubicada la parcela?', 'plot'],
  ['Hola, ¿cómo estás?', 'unknown'],
]

describe('classifyIntent', () => {
  it.each(CASES)('classifies %j as %s', (question, expected) => {
    expect(classifyIntent(question)).toBe(expected)
  })

  it('normalizes accents and case before matching', () => {
    expect(classifyIntent('¿HAY RIESGO DE HELADA?')).toBe('temperature')
    expect(classifyIntent('precipitación')).toBe('water')
  })

  it('prefers a more specific intent over a general one', () => {
    // Contains both "agua" (water) and "suelo" (soil moisture).
    expect(classifyIntent('¿cuánta agua hay en el suelo?')).toBe('soilMoisture')
  })

  it('returns unknown rather than guessing for an unrelated question', () => {
    expect(classifyIntent('¿Quién ganó el partido?')).toBe('unknown')
  })
})
