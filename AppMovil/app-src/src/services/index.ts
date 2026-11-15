// Capa de servicios: la UI sólo habla con estas funciones. Hoy devuelven datos de
// demostración; al conectar un servicio real basta con reemplazar su implementación.
import type { Analysis, Business, Parcel } from '../types'
import { BUYERS, PRICE_TREND, CROPS, rolling } from './demoData'
import { INTEGRATIONS } from './config'
import { areaHa } from '../lib/geo'
import { backendFetch, DEMO_PLOT_ID } from './backend'

const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms))

export type Kind = 'Histórico' | 'Observación satelital' | 'Estimación' | 'Pronóstico externo'
export interface Indicator {
  id: string; name: string; unit: string; kind: Kind; agg: 'sum' | 'avg' | 'last'; color: string
  series: { label: string; value: number }[]; explain: string; source: string; updated: string
  status: 'Demostración' | 'Disponible' | 'No disponible'; decimals: number
}
export async function getIndicators(): Promise<Indicator[]> {
  await wait()
  const src = (s: string) => `${s} — fuente prevista, aún no conectada`
  const base = { updated: 'Sin actualización real (datos de ejemplo)', status: 'Demostración' as const }
  return [
    { ...base, id: 'ndvi', name: 'NDVI (vigor de vegetación)', unit: 'índice 0–1', kind: 'Observación satelital', agg: 'last', color: '#3f7d4e', decimals: 2, series: rolling('ndvi'),
      explain: 'Mide qué tan verde y activa se ve la vegetación desde el satélite. Más alto suele indicar más follaje sano. No indica minerales ni nutrientes del suelo.', source: src('NASA Earthdata / Sentinel-2') },
    { ...base, id: 'precip', name: 'Precipitación histórica', unit: 'mm', kind: 'Histórico', agg: 'sum', color: '#3f6f8f', decimals: 0, series: rolling('precip'),
      explain: 'Lluvia acumulada en el periodo, según registros históricos. Es un dato del pasado: no es un pronóstico de lluvia.', source: src('NASA POWER') },
    { ...base, id: 'temp', name: 'Temperatura media', unit: '°C', kind: 'Histórico', agg: 'avg', color: '#c0693a', decimals: 1, series: rolling('temp'),
      explain: 'Temperatura promedio del aire. Ayuda a saber si el cultivo está en un rango cómodo para crecer.', source: src('NASA POWER') },
    { ...base, id: 'solar', name: 'Radiación solar', unit: 'kWh/m²/día', kind: 'Histórico', agg: 'avg', color: '#d49a1f', decimals: 1, series: rolling('solar'),
      explain: 'Energía del sol que llega al suelo. Más radiación impulsa la fotosíntesis, pero también la evaporación.', source: src('NASA POWER') },
    { ...base, id: 'et', name: 'Evapotranspiración', unit: 'mm/día', kind: 'Estimación', agg: 'avg', color: '#6d9872', decimals: 1, series: rolling('et'),
      explain: 'Estimación del agua que pierden suelo y planta cada día. Si es mayor que la lluvia, el cultivo puede necesitar riego.', source: src('Cálculo estimado a partir de NASA POWER') },
    { ...base, id: 'hum', name: 'Humedad ambiental', unit: '%', kind: 'Histórico', agg: 'avg', color: '#5b8a96', decimals: 0, series: rolling('hum'),
      explain: 'Cantidad de vapor de agua en el aire. Muy alta favorece hongos; muy baja aumenta la sed del cultivo.', source: src('NASA POWER') },
  ]
}
export function summarize(i: Indicator, n: number) {
  const v = i.series.slice(-n).map((p) => p.value)
  if (i.agg === 'sum') return v.reduce((a, b) => a + b, 0)
  if (i.agg === 'last') return v[v.length - 1]
  return v.reduce((a, b) => a + b, 0) / v.length
}
export async function getWeather() {
  await wait(350)
  return {
    status: INTEGRATIONS.weather.connected ? 'Conectado' : 'Demostración', temp: 24, humidity: 58, rainProb: 35, wind: 12,
    source: 'Pronóstico externo no conectado', updated: 'Sin actualización real',
    note: 'Probabilidad de lluvia moderada. Antes de regar, revisa la humedad del suelo con la mano.',
  }
}
export async function getPrices() {
  await wait()
  return Object.keys(PRICE_TREND).map((crop) => {
    const s = PRICE_TREND[crop]
    return { crop, price: s[s.length - 1], change: ((s[s.length - 1] - s[0]) / s[0]) * 100, series: s, region: 'Región de demostración', unit: 'MXN por tonelada', source: 'Datos de ejemplo — fuentes oficiales no conectadas', updated: 'Sin actualización real' }
  })
}
export async function getBuyers() { await wait(); return BUYERS }

// ---- VÍA (simulada) ----
interface Ctx { parcel: Parcel | null; business: Business }
const MISSING_LABELS: [keyof Parcel, string][] = [['areaHa', 'Superficie'], ['terrain', 'Tipo de terreno'], ['soil', 'Tipo de suelo'], ['water', 'Disponibilidad de agua'], ['irrigation', 'Sistema de riego'], ['crop', 'Cultivo actual'], ['sowingDate', 'Fecha de siembra'], ['stage', 'Etapa de crecimiento'], ['altitude', 'Altitud']]
export const missingFields = (p: Parcel) => MISSING_LABELS.filter(([k]) => !p[k]).map(([, l]) => l)

export function buildAnalysis(p: Parcel, ind: Indicator[]): Analysis {
  const miss = missingFields(p)
  const ndvi = ind.find((i) => i.id === 'ndvi')!
  const nv = ndvi.series[ndvi.series.length - 1].value
  const dry = /escasa|limitada/i.test(p.water) && /temporal/i.test(p.irrigation)
  const pct = Math.round(((MISSING_LABELS.length - miss.length) / MISSING_LABELS.length) * 100)
  return {
    happening: [
      `Registraste ${p.crop || 'un cultivo sin definir'} en ${p.areaHa ? p.areaHa + ' ha' : 'una superficie sin definir'}${p.stage ? ', etapa: ' + p.stage.toLowerCase() : ''}. (Comprobado: lo capturaste tú)`,
      `El NDVI de ejemplo es ${nv.toFixed(2)}, vegetación ${nv > 0.55 ? 'vigorosa' : nv > 0.35 ? 'moderada' : 'escasa'}. (Observación de demostración)`,
      p.water ? `Agua ${p.water.toLowerCase()} con riego ${p.irrigation ? p.irrigation.toLowerCase() : 'sin definir'}. (Comprobado: lo capturaste tú)` : 'No indicaste la disponibilidad de agua.',
    ],
    meaning: dry ? 'Tu cultivo depende de la lluvia y el agua es limitada: periodos secos pueden afectar el rendimiento, sobre todo en floración y llenado de grano.' : 'Con la información disponible no se ven señales de alarma, pero los datos son de demostración y no sustituyen una revisión en campo.',
    alternatives: dry ? ['Mantener el cultivo actual y vigilar la humedad del suelo.', 'Evaluar cultivos más tolerantes a la sequía para la próxima temporada (por ejemplo sorgo).', 'Explorar opciones de captación de agua o riego complementario.'] : ['Mantener el plan actual.', 'Comparar con otro cultivo en el Simulador de Mercado.', 'Ajustar fechas de siembra según el historial de lluvias.'],
    recommendation: dry ? 'Prioriza monitorear la humedad del suelo cada semana y planea el siguiente ciclo con cultivos o fechas adaptados a la lluvia.' : 'Continúa con tu manejo y revisa la imagen satelital cada dos semanas para detectar cambios.',
    why: dry ? 'Porque indicaste riego temporal y agua limitada; esta es una recomendación general basada en tus respuestas, no un diagnóstico.' : 'Porque los datos registrados no muestran restricciones de agua; es una recomendación general, no un diagnóstico.',
    used: [
      ...MISSING_LABELS.filter(([k]) => p[k]).map(([, l]) => ({ label: l, kind: 'Registrado' as const })),
      { label: 'NDVI histórico', kind: 'Demostración' as const }, { label: 'Clima histórico', kind: 'Demostración' as const },
    ],
    confidence: { level: pct >= 80 ? 'Media' : 'Baja', pct, note: 'Nunca es alta mientras los datos satelitales y de clima sean de demostración.' },
    missing: [...miss, 'Análisis de suelo de laboratorio', 'Pronóstico meteorológico real', 'Datos satelitales reales de tu polígono'],
  }
}

// Preguntas normales van al Backend real (VÍA de verdad, respuestas por plantilla sobre datos
// reales de NASA POWER / ORNL DAAC / Modelo para la parcela demo). "Analizar mi parcela" sigue
// local: el Backend no tiene un intent equivalente al reporte estructurado de 8 secciones que
// arma buildAnalysis(), y no autoriza parcelas que el usuario registró él mismo (no hay todavía
// un endpoint para crear una parcela real — ver INTEGRACION.md §5). Si el Backend falla o está
// dormido (Render free tier), se usa la respuesta local simulada como respaldo, no como engaño.
async function askViaReal(q: string): Promise<string | null> {
  try {
    const data = await backendFetch(`/plots/${DEMO_PLOT_ID}/via/ask`, {
      method: 'POST', body: JSON.stringify({ question: q }),
    })
    return data.answer as string
  } catch {
    return null
  }
}

export async function askVia(q: string, ctx: Ctx, ind: Indicator[]): Promise<{ text?: string; analysis?: Analysis }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Sin conexión a internet')
  const p = ctx.parcel
  const t = q.toLowerCase()
  // Solo se consulta el Backend real cuando la parcela activa es la de demostración (o no hay
  // ninguna) — es la única que existe como registro real en el servidor. Una parcela que el
  // usuario registró por su cuenta no tiene equivalente ahí; usarla mezclaría datos reales de
  // Guadalupe Victoria con una parcela que no es esa.
  if (!/analiz/.test(t) && (!p || p.demo)) {
    const real = await askViaReal(q)
    if (real) return { text: real }
  }
  await wait(900 + Math.random() * 600)
  if (/analiz/.test(t)) {
    if (!p) return { text: 'Para analizar tu parcela primero necesito que la registres en el módulo Mi parcela. No quiero inventar datos.' }
    return { analysis: buildAnalysis(p, ind) }
  }
  if (!p && /(condicion|cultivo|mejorar|riesgo)/.test(t)) return { text: 'Todavía no tengo datos de tu parcela. Regístrala en Mi parcela (tres pasos) o abre la parcela de demostración, y con eso te respondo con información concreta.' }
  if (/condicion/.test(t) && p) {
    const m = missingFields(p)
    return { text: `Esto es lo que tengo de ${p.name}:\n• Cultivo: ${p.crop || 'sin definir'}\n• Superficie: ${p.areaHa ? p.areaHa + ' ha' : 'sin definir'}\n• Suelo: ${p.soil || 'sin definir'} · Terreno: ${p.terrain || 'sin definir'}\n• Agua: ${p.water || 'sin definir'} · Riego: ${p.irrigation || 'sin definir'}\n• Etapa: ${p.stage || 'sin definir'}\n\n${m.length ? 'Me falta: ' + m.join(', ').toLowerCase() + '. ' : ''}El clima que ves en la app es de demostración, aún no hay un servicio meteorológico conectado.` }
  }
  if (/cultivo.*conviene|qué cultivo|que cultivo/.test(t)) return { text: `No puedo decirte con certeza qué cultivo te conviene: no tengo análisis de suelo ni precios reales conectados.\n\nLo que sí puedo hacer es ayudarte a decidir:\n• ${p?.water && /escasa|limitada/i.test(p.water) ? 'Con agua limitada, conviene evaluar cultivos tolerantes a la sequía, como el sorgo.' : 'Revisa qué cultivos has sembrado y cómo te fue (Huella inteligente).'}\n• En Mercado > Simulador puedes comparar ganancia estimada de maíz, frijol, sorgo y otros con tus propios costos.\n• Consulta a un técnico agrícola de tu zona para confirmar.` }
  if (/lluvia/.test(t)) {
    const pr = ind.find((i) => i.id === 'precip')!
    const tot = summarize(pr, 12)
    return { text: `No tengo un pronóstico de lluvia conectado, así que no puedo decirte cómo estarán las lluvias.\n\nLo que sí tengo es historia (datos de demostración): en los últimos 12 meses sumaron ${tot.toFixed(0)} mm, con la mayor parte entre junio y septiembre.\n\nNASA POWER aporta datos históricos, no pronósticos exactos por parcela. Para pronósticos, se conectará un servicio meteorológico externo.` }
  }
  if (/satelital|ndvi|sat[eé]lite/.test(t)) return { text: 'Las imágenes satelitales muestran cómo se ve tu campo desde arriba. El NDVI mide qué tan verde y activa está la vegetación: cerca de 0.2 es poca vegetación, y más de 0.6 es vegetación vigorosa.\n\nOjo: el NDVI no dice qué minerales o nutrientes tiene el suelo. Para eso se necesita un análisis de laboratorio.\n\nLos valores que ves ahora son de demostración.' }
  if (/mejorar|producci/.test(t)) return { text: `Ideas generales para mejorar tu producción (no son un diagnóstico):\n• Revisa la humedad del suelo cada semana${p?.irrigation && /temporal/i.test(p.irrigation) ? ', porque dependes de la lluvia' : ''}.\n• Haz un análisis de suelo para ajustar el fertilizante y no gastar de más.\n• Registra tus eventos en la Huella inteligente para aprender de cada temporada.\n• Calcula tu punto de equilibrio en Mercado > Mi modelo de negocio.` }
  if (/riesgo|prevenir/.test(t)) return { text: `Riesgos comunes a vigilar${p?.stage ? ' en etapa de ' + p.stage.toLowerCase() : ''}:\n• Falta de agua en periodos críticos (floración y llenado de grano).\n• Exceso de humedad: favorece hongos.\n• Plagas: revisa tus plantas con frecuencia.\n• Precio bajo en cosecha: compara compradores antes de vender.\n\nSon riesgos generales; aún no tengo alertas reales conectadas.` }
  return { text: 'Aún no sé responder esa pregunta con datos confiables. Puedo ayudarte con las condiciones de tu parcela, qué significan los datos satelitales, lluvias históricas, riesgos o tu producción. También puedes tocar «Analizar mi parcela».' }
}
export const cropPreset = (c: string) => CROPS[c]
export { areaHa }
