import { computeWaterBalance } from './waterBalance'
import { computeRainMetrics } from './rainMetrics'
import { computeMoistureAnomaly } from './moistureAnomaly'
import { computeSoilTemperatureAverages } from './soilTemperature'
import { isBareSoil } from './bareSoil'
import { computeGrowingDegreeDaysAccum } from './growingDegreeDays'
import { imputeGaps } from './imputation'
import { resampleToMonthly } from './harmonize'
import type { Provenance } from '../../types/provenance'
import type { PlotIndicators } from '../../types/firestoreDocs'

const ENGINE_VERSION = '1.0.0'

// ASSUMPTION: no documented NDVI bare-soil cover threshold was found; 0.3 is a commonly used
// cutoff for sparse/bare vegetation and should be reviewed by an agronomist (spec §17).
const NDVI_COVER_THRESHOLD = 0.3
// ASSUMPTION: standard 0°C frost definition; the spec names the metric but not the threshold.
const FROST_TEMP_C = 0
// ASSUMPTION: this function only receives cropBaseTempC, not a per-crop max temperature, so a
// generic field-crop heat-stress threshold stands in until that's threaded through.
const HEAT_STRESS_TEMP_C = 35
// ASSUMPTION: spec §8 asks for extreme-rain days above "the historical 95th percentile of that
// cell," but no climatology baseline is wired into this function yet — a fixed daily threshold
// stands in until a dedicated per-cell climatology input is added (real-workers follow-up plan).
const FALLBACK_EXTREME_RAIN_MM = 20
// ASSUMPTION: spec §5.1's NASA POWER parameter list has no evapotranspiration parameter, so the
// water balance below is rain-only (ET term is 0) until a real ET source/calculation exists.
const NO_ET_DATA = 0

export interface ClimateDayInput {
  date: string
  values: Record<string, number | null>
  provenance: Provenance
}

export interface SoilMoistureDayInput {
  date: string
  smSurface: number | null
  smRootzone: number | null
  smRootzonePctl: number | null
  soilTempLayer1: number | null
  provenance: Provenance
}

export interface NdviDayInput {
  date: string
  ndvi: number
  evi: number
  qualityOk: boolean
  provenance: Provenance
}

export interface ComputeIndicatorsInput {
  plotId: string
  month: string
  climate: ClimateDayInput[]
  soilMoisture: SoilMoistureDayInput[]
  ndvi: NdviDayInput[]
  cropBaseTempC: number
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
}

// Last value that was actually reported, not simply the last calendar entry: a day with a
// missing reading must not erase a real earlier observation.
function lastReported(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null) {
      return values[i]
    }
  }
  return null
}

// Trailing-window fields (waterBalance*, soilTempAvg*, moistureAnomalyPctl) use the full arrays
// as provided — the caller is responsible for including enough trailing days before the target
// month. Calendar-month fields (rain totals, air temp stats, frost/heat days, GDD, NDVI, bare
// soil) are scoped to `input.month` via resampleToMonthly, the one documented harmonization step
// spec §8 requires.
export function computeIndicators(input: ComputeIndicatorsInput): PlotIndicators {
  const { climate, soilMoisture, ndvi, cropBaseTempC, month } = input

  const monthClimate = climate.filter((d) => d.date.startsWith(month))
  const monthNdvi = ndvi.filter((d) => d.date.startsWith(month))

  // Precipitation is never imputed or zero-filled: a missing reading is dropped from every
  // rain-derived figure rather than counted as zero (spec §8, "never silently fill").
  const rainDaysFull = climate
    .filter((d) => typeof d.values.PRECTOTCORR === 'number')
    .map((d) => ({ date: d.date, rainMm: d.values.PRECTOTCORR as number }))
  const rainDaysMonth = rainDaysFull.filter((d) => d.date.startsWith(month))

  const waterBalanceDays = rainDaysFull.map((d) => ({
    date: d.date,
    rainMm: d.rainMm,
    evapotranspirationMm: NO_ET_DATA,
  }))

  const rainMetrics = computeRainMetrics(rainDaysMonth, FALLBACK_EXTREME_RAIN_MM)

  const t2mImputed = imputeGaps(
    climate.map((d) => ({ date: d.date, value: d.values.T2M ?? null })),
    3,
  )
  const monthGddDays = t2mImputed
    .filter((d) => d.date.startsWith(month) && d.value !== null)
    .map((d) => ({ date: d.date, tempAvgC: d.value as number }))

  const moistureAnomalyPctl = computeMoistureAnomaly(
    soilMoisture.map((d) => ({ date: d.date, smRootzonePctl: d.smRootzonePctl })),
  )
  const soilTempAverages = computeSoilTemperatureAverages(
    soilMoisture.map((d) => ({ date: d.date, soilTempC: d.soilTempLayer1 })),
  )

  const numericValuesOf = (key: string): number[] =>
    monthClimate.map((d) => d.values[key]).filter((v): v is number => typeof v === 'number')

  const averageOrNull = (values: number[]): number | null => (values.length === 0 ? null : average(values))
  const maxOrNull = (values: number[]): number | null => (values.length === 0 ? null : Math.max(...values))
  const minOrNull = (values: number[]): number | null => (values.length === 0 ? null : Math.min(...values))

  const monthlyAirTemp = {
    avg: averageOrNull(numericValuesOf('T2M')),
    max: maxOrNull(numericValuesOf('T2M_MAX')),
    min: minOrNull(numericValuesOf('T2M_MIN')),
    rh: averageOrNull(numericValuesOf('RH2M')),
  }

  const monthlyNdvi = resampleToMonthly(
    monthNdvi.map((d) => ({ date: d.date, ndvi: d.ndvi })),
    (rows) => ({ ndvi: average(rows.map((r) => r.ndvi)) }),
  )[0]?.data.ndvi ?? null

  const frostDays = monthClimate.filter((d) => typeof d.values.T2M_MIN === 'number' && d.values.T2M_MIN < FROST_TEMP_C)
  const heatStressDays = monthClimate.filter((d) => typeof d.values.T2M_MAX === 'number' && d.values.T2M_MAX > HEAT_STRESS_TEMP_C)
  const lastFrostDate = frostDays.length > 0 ? frostDays[frostDays.length - 1].date : null

  const bareSoilFlags = monthNdvi
    .map((d) => isBareSoil(d.ndvi, d.qualityOk, NDVI_COVER_THRESHOLD))
    .filter((v): v is boolean => v !== null)
  const bareSoil = bareSoilFlags.length === 0
    ? null
    : bareSoilFlags.filter(Boolean).length > bareSoilFlags.length / 2

  const sources = [
    ...climate.map((d) => d.provenance),
    ...soilMoisture.map((d) => d.provenance),
    ...ndvi.map((d) => d.provenance),
  ].map((p) => `${p.source} (${p.product}) v${p.version} asOf=${p.asOf} latencyDays=${p.latencyDays} origin=${p.origin}`)

  return {
    rainAccumMm: rainMetrics.rainAccumMm,
    rainyDays: rainMetrics.rainyDays,
    extremeRainDays: rainMetrics.extremeRainDays,
    maxDrySpellDays: rainMetrics.maxDrySpellDays,
    waterBalance5d: computeWaterBalance(waterBalanceDays, 5),
    waterBalance10d: computeWaterBalance(waterBalanceDays, 10),
    waterBalance15d: computeWaterBalance(waterBalanceDays, 15),
    waterBalance30d: computeWaterBalance(waterBalanceDays, 30),
    surfaceSoilMoisture: lastReported(soilMoisture.map((d) => d.smSurface)),
    rootZoneSoilMoisture: lastReported(soilMoisture.map((d) => d.smRootzone)),
    moistureAnomalyPctl,
    soilTempAvg7d: soilTempAverages.avg7d,
    soilTempAvg10d: soilTempAverages.avg10d,
    airTempAvg: monthlyAirTemp.avg,
    airTempMax: monthlyAirTemp.max,
    airTempMin: monthlyAirTemp.min,
    relativeHumidityAvg: monthlyAirTemp.rh,
    frostDays: frostDays.length,
    lastFrostDate,
    heatStressDays: heatStressDays.length,
    growingDegreeDaysAccum: computeGrowingDegreeDaysAccum(monthGddDays, cropBaseTempC),
    ndviAvg: monthlyNdvi,
    ndviDeviationVsYears: null, // no multi-year baseline passed into this function yet
    bareSoil,
    sources: Array.from(new Set(sources)),
    rainfallProvenance: climate.length > 0 ? climate[climate.length - 1].provenance : null,
    moistureAnomalyProvenance: soilMoisture.length > 0 ? soilMoisture[soilMoisture.length - 1].provenance : null,
    ndviProvenance: ndvi.length > 0 ? ndvi[ndvi.length - 1].provenance : null,
    asOf: monthClimate.length > 0 ? monthClimate[monthClimate.length - 1].date : `${month}-01`,
    engineVersion: ENGINE_VERSION,
  }
}
