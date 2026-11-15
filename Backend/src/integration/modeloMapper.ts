import type { PlotSnapshot } from '../types/firestoreDocs'
import type { ParcelaInput } from './modeloTypes'

export interface SowingEvent {
  date: string // YYYY-MM-DD
  type: string
}

export interface ModeloMapperInput {
  plot: PlotSnapshot
  // plots/{id}/events, per the backend spec's Firestore schema — no fixed TS type exists for it
  // yet (collection path only, see firestore/collections.ts), so the mapper takes the raw shape
  // it needs rather than importing one that doesn't exist.
  events?: SowingEvent[]
}

const MODE_TO_SISTEMA_RIEGO: Record<PlotSnapshot['mode'], string> = {
  rainfed: 'temporal',
  irrigated: 'riego',
}

const SISTEMA_RIEGO_TO_MODE: Record<string, PlotSnapshot['mode']> = {
  temporal: 'rainfed',
  riego: 'irrigated',
}

function latestSowingDate(events: SowingEvent[]): string | null {
  const sowings = events.filter((e) => e.type === 'sowing').sort((a, b) => b.date.localeCompare(a.date))
  return sowings[0]?.date ?? null
}

// Backend PlotSnapshot -> Modelo ParcelaInput. Throws, naming every missing field at once,
// rather than filling any of them with an invented value (project rule: no fabricated data).
export function toParcelaInput(input: ModeloMapperInput): ParcelaInput {
  const { plot, events = [] } = input
  const missing: string[] = []

  if (plot.terrainType === undefined) missing.push('plot.terrainType')
  if (plot.growthStage === undefined) missing.push('plot.growthStage')
  const fechaSiembra = latestSowingDate(events)
  if (fechaSiembra === null) missing.push('a sowing event in plots/{id}/events (type: "sowing")')

  if (missing.length > 0) {
    throw new Error(`Cannot map plot "${plot.name}" to a Modelo ParcelaInput — missing: ${missing.join(', ')}.`)
  }

  return {
    latitud: plot.center.lat,
    longitud: plot.center.lon,
    superficie_hectareas: plot.areaHa,
    tipo_terreno: plot.terrainType as string,
    tipo_suelo: plot.declaredSoilType,
    disponibilidad_agua: plot.constraints.waterAvailability,
    sistema_riego: MODE_TO_SISTEMA_RIEGO[plot.mode],
    cultivo_actual: plot.currentCrop,
    fecha_siembra: fechaSiembra as string,
    etapa_crecimiento: plot.growthStage as string,
  }
}

export type PlotFieldsFromParcela = Pick<
  PlotSnapshot,
  'center' | 'areaHa' | 'terrainType' | 'declaredSoilType' | 'constraints' | 'mode' | 'currentCrop' | 'growthStage'
> & { fechaSiembra: string }

// The inverse mapping, for round-trip tests (Modelo never actually sends the Backend a
// ParcelaInput in production — the Backend only ever builds one to call Modelo).
export function fromParcelaInput(parcela: ParcelaInput): PlotFieldsFromParcela {
  const mode = SISTEMA_RIEGO_TO_MODE[parcela.sistema_riego]
  if (mode === undefined) {
    throw new Error(`Unknown sistema_riego "${parcela.sistema_riego}" — expected "temporal" or "riego".`)
  }

  return {
    center: { lat: parcela.latitud, lon: parcela.longitud },
    areaHa: parcela.superficie_hectareas,
    terrainType: parcela.tipo_terreno,
    declaredSoilType: parcela.tipo_suelo,
    constraints: { waterAvailability: parcela.disponibilidad_agua as PlotSnapshot['constraints']['waterAvailability'], equipment: [] },
    mode,
    currentCrop: parcela.cultivo_actual,
    growthStage: parcela.etapa_crecimiento,
    fechaSiembra: parcela.fecha_siembra,
  }
}
