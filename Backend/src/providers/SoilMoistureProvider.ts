import type { Provenance } from '../types/provenance'
import { seededRandom, enumerateDates } from './seededRandom'
import type { ClimateProvider } from './ClimateProvider'

// Every value is nullable on purpose: NASA POWER can report a day without GWETTOP/GWETROOT/TS,
// and a missing reading must stay missing (never zero-filled). Only the provenance is always
// present, so the indicators engine can still cite where the series came from.
export interface SoilMoistureDay {
  date: string
  smSurface: number | null
  smRootzone: number | null
  smRootzonePctl: number | null
  soilTempLayer1: number | null
  provenance: Provenance
}

export interface SoilMoistureProvider {
  getDailySeries(cellId: string, from: string, to: string): Promise<SoilMoistureDay[]>
}

// Derives the soil-moisture series from the real NASA POWER daily series the climate provider
// already fetched. No extra HTTP call and no new credentials:
//   GWETTOP  -> surface soil moisture (volumetric fraction)
//   GWETROOT -> root-zone soil moisture (volumetric fraction)
//   TS       -> soil temperature at layer 1 (°C)
//
// These are land-surface model outputs, not satellite observations, so `kind` is 'estimated';
// `origin` is inherited from the climate day, which is 'real' for the Modelo-backed provider.
//
// smRootzonePctl stays null: a percentile is only meaningful against a real multi-year
// climatology for the same calendar window, and this build does not fetch one. The Backend's
// rotation engine records that gap instead of inventing a percentile.
export class PowerSoilMoistureProvider implements SoilMoistureProvider {
  private memoKey: string | null = null
  private memoValue: SoilMoistureDay[] | null = null

  constructor(private readonly climate: ClimateProvider) {}

  async getDailySeries(cellId: string, from: string, to: string): Promise<SoilMoistureDay[]> {
    const key = `${cellId}|${from}|${to}`
    // The indicators route asks for the climate window first and then the soil-moisture window
    // with the same (cell, from, to); reusing the last result avoids a duplicate upstream call.
    if (this.memoKey === key && this.memoValue !== null) {
      return this.memoValue
    }

    const climate = await this.climate.getDailySeries(cellId, from, to)
    const series = climate.map((day): SoilMoistureDay => ({
      date: day.date,
      smSurface: numericValue(day.values.GWETTOP),
      smRootzone: numericValue(day.values.GWETROOT),
      smRootzonePctl: null,
      soilTempLayer1: numericValue(day.values.TS),
      provenance: {
        ...day.provenance,
        product: 'GWETTOP/GWETROOT/TS daily',
        kind: 'estimated',
      },
    }))

    this.memoKey = key
    this.memoValue = series
    return series
  }
}

function numericValue(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export class SimulatedSoilMoistureProvider implements SoilMoistureProvider {
  async getDailySeries(cellId: string, from: string, to: string): Promise<SoilMoistureDay[]> {
    const dates = enumerateDates(from, to)
    return dates.map((date) => {
      const rand = seededRandom(`${cellId}:${date}:smap`)
      return {
        date,
        smSurface: Math.round(rand() * 100) / 100,
        smRootzone: Math.round(rand() * 100) / 100,
        smRootzonePctl: Math.round(rand() * 100),
        soilTempLayer1: Math.round(rand() * 400) / 10,
        provenance: {
          source: 'SMAP SPL4SMGP (simulated)',
          product: 'v8',
          version: 'sim-1',
          asOf: date,
          latencyDays: 0,
          kind: 'satelliteObservation',
          origin: 'simulated',
        },
      }
    })
  }
}
