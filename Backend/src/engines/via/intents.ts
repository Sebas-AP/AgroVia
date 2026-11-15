// Deterministic intent classification for the VÍA assistant. No model call, no generated text:
// the question is normalized and matched against an ordered keyword list, and every supported
// intent maps to a fixed template builder in engines/via/index.ts.

export type ViaIntent =
  | 'water'
  | 'soilMoisture'
  | 'temperature'
  | 'ndvi'
  | 'strategies'
  | 'economics'
  | 'market'
  | 'plot'
  | 'unknown'

interface IntentRule {
  intent: Exclude<ViaIntent, 'unknown'>
  patterns: RegExp[]
}

// Order matters: a question like "how much water is in the soil?" matches both soil moisture and
// water, and the more specific soil-moisture intent must win.
const RULES: IntentRule[] = [
  {
    intent: 'market',
    patterns: [/\b(precio|precios|mercado|vender|venta|comprador|comercializ)/],
  },
  {
    intent: 'economics',
    patterns: [/\b(costo|costos|coste|gasto|gastos|inversion|invert|margen|ganancia|utilidad|rentab|presupuesto|economi)/],
  },
  {
    intent: 'strategies',
    patterns: [
      /\b(rotacion|estrategia|estrategias|alternativa|sembr|siembr|recomiend|conviene)/,
      /\bcultivo siguiente\b/,
    ],
  },
  {
    intent: 'ndvi',
    patterns: [/\b(ndvi|vegetacion|vigor|satelite|satelital)\b/],
  },
  {
    intent: 'temperature',
    patterns: [/\b(helada|heladas|calor|temperatura|grados dia|gdd|frio|congel)/],
  },
  {
    intent: 'soilMoisture',
    patterns: [/\b(humedad|smap|suelo)\b/],
  },
  {
    intent: 'water',
    patterns: [/\b(lluvia|lluvias|llov\w*|precipitacion|agua|riego|regar|sequia|drenaje|clima)\b/, /\bbalance hidrico\b/],
  },
  {
    intent: 'plot',
    patterns: [/\b(parcela|superficie|hectarea|hectareas|area|poligono|altitud|municipio|ubicacion|donde)\b/],
  },
]

export function normalizeQuestion(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function classifyIntent(question: string): ViaIntent {
  const normalized = normalizeQuestion(question)
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.intent
    }
  }
  return 'unknown'
}
