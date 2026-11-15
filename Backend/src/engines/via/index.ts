import type { PlotIndicators, PlotSnapshot } from '../../types/firestoreDocs'
import type { RotationStrategy } from '../../types/strategy'
import type { BusinessInputs } from '../../types/business'
import type { PriceSnapshot } from '../../providers/PricesProvider'
import type { Evidence, Provenance } from '../../types/provenance'
import { computeEconomicResult } from '../economics'
import { analyzePlotGeometry } from '../../geo/plotGeometry'
import type { ViaIntent } from './intents'
import { assertGrounded } from './verification'

const ASSISTANT_VERSION = '1.0.0'

export interface ViaContext {
  plot: PlotSnapshot
  indicators?: PlotIndicators
  strategies?: RotationStrategy[]
  business?: BusinessInputs | null
  // Validation errors for a stored business record that exists but is unusable.
  businessErrors?: string[]
  price?: PriceSnapshot | null
}

export interface ViaAnswer {
  intent: ViaIntent
  answer: string
  evidence: Evidence[]
  infoGaps: string[]
}

interface Citation {
  label: string
  unit: string
  value: number
  period: string
  provenance: Provenance
  // Optional display precision override. Defaults to 2 decimals; coordinates need more so a
  // rounded figure is never mistaken for the plot's actual location.
  decimals?: number
}

// Significant digits kept for coordinate citations (about 0.1 m at this latitude).
const COORDINATE_DECIMALS = 6

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format a non-finite figure in a VÍA answer: ${value}`)
  }
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

// Builds the answer and its evidence together, so a figure can only enter the prose through
// cite() — the formatter and the evidence entry are the same call.
class Draft {
  readonly evidence: Evidence[] = []
  readonly infoGaps: string[] = []
  private readonly sentences: string[] = []

  add(sentence: string): void {
    this.sentences.push(sentence)
  }

  cite(citation: Citation): string {
    const formatted = formatNumber(citation.value, citation.decimals)
    this.evidence.push({
      label: citation.label,
      value: formatted,
      unit: citation.unit,
      period: citation.period,
      provenance: citation.provenance,
    })
    return formatted
  }

  build(): string {
    return this.sentences.join(' ')
  }
}

function recordedPlotProvenance(plot: PlotSnapshot): Provenance {
  return {
    source: 'Farmer-declared plot profile',
    product: 'plot snapshot',
    version: 'v1',
    asOf: plot.updatedAt,
    latencyDays: 0,
    kind: 'recorded',
    origin: plot.origin,
  }
}

function recordedBusinessProvenance(plot: PlotSnapshot): Provenance {
  return {
    source: 'Farmer-reported business/current record',
    product: 'costs, yield and price',
    version: 'v1',
    asOf: plot.updatedAt,
    latencyDays: 0,
    kind: 'recorded',
    origin: plot.origin,
  }
}

function computedProvenance(plot: PlotSnapshot, product: string, asOf: string): Provenance {
  return {
    source: 'AGROVÍA Backend (computed)',
    product,
    version: ASSISTANT_VERSION,
    asOf,
    latencyDays: 0,
    kind: 'estimated',
    origin: plot.origin === 'demo' ? 'demo' : 'real',
  }
}

function answerWater(draft: Draft, indicators: PlotIndicators): void {
  const provenance = indicators.rainfallProvenance
  if (!provenance) {
    draft.add('No climate series is available for the analysis window, so there is no rainfall or water-balance figure to report.')
    draft.infoGaps.push('No climate provenance available for the current indicator window.')
    return
  }

  const rain = draft.cite({
    label: 'Accumulated rainfall', unit: 'mm', value: indicators.rainAccumMm,
    period: indicators.asOf, provenance,
  })
  const rainyDays = draft.cite({
    label: 'Rainy days', unit: 'days', value: indicators.rainyDays,
    period: indicators.asOf, provenance,
  })
  const drySpell = draft.cite({
    label: 'Longest dry spell', unit: 'days', value: indicators.maxDrySpellDays,
    period: indicators.asOf, provenance,
  })
  const extremeDays = draft.cite({
    label: 'Extreme-rain days', unit: 'days', value: indicators.extremeRainDays,
    period: indicators.asOf, provenance,
  })

  draft.add(
    `Recorded rainfall over the analysed window totals ${rain} mm across ${rainyDays} rainy days, `
    + `with a longest dry spell of ${drySpell} days and ${extremeDays} extreme-rain days.`,
  )

  if (indicators.waterBalance5d !== null) {
    const shortBalance = draft.cite({
      label: 'Short-term water balance', unit: 'mm', value: indicators.waterBalance5d,
      period: indicators.asOf, provenance,
    })
    draft.add(`The short-term water balance is ${shortBalance} mm.`)
  }
  if (indicators.waterBalance30d !== null) {
    const monthlyBalance = draft.cite({
      label: 'Monthly water balance', unit: 'mm', value: indicators.waterBalance30d,
      period: indicators.asOf, provenance,
    })
    draft.add(`The monthly water balance is ${monthlyBalance} mm.`)
  }

  if (indicators.rainAccumMm === 0 || indicators.rainyDays === 0) {
    draft.infoGaps.push(
      'Rainfall totals only cover days with a recorded precipitation value — a missing NASA POWER '
      + 'reading is skipped, never counted as zero, so the total may be incomplete.',
    )
  }

  draft.add('These figures describe the regional climate grid cell around the plot, not a sensor inside the field.')
}

function answerSoilMoisture(draft: Draft, indicators: PlotIndicators): void {
  const provenance = indicators.moistureAnomalyProvenance
  if (!provenance) {
    draft.add('No soil-moisture series is available for the analysis window.')
    draft.infoGaps.push('No soil-moisture provenance available for the current indicator window.')
    return
  }

  const clauses: string[] = []
  if (indicators.surfaceSoilMoisture !== null) {
    const surface = draft.cite({
      label: 'Surface soil moisture', unit: 'volumetric fraction', value: indicators.surfaceSoilMoisture,
      period: indicators.asOf, provenance,
    })
    clauses.push(`surface soil moisture is ${surface} (volumetric fraction)`)
  }
  if (indicators.rootZoneSoilMoisture !== null) {
    const rootZone = draft.cite({
      label: 'Root-zone soil moisture', unit: 'volumetric fraction', value: indicators.rootZoneSoilMoisture,
      period: indicators.asOf, provenance,
    })
    clauses.push(`root-zone soil moisture is ${rootZone} (volumetric fraction)`)
  }
  if (clauses.length > 0) {
    draft.add(`At the latest observation, ${clauses.join(' and ')}.`)
  }

  if (indicators.moistureAnomalyPctl !== null) {
    const percentile = draft.cite({
      label: 'Root-zone moisture anomaly', unit: 'percentile', value: indicators.moistureAnomalyPctl,
      period: indicators.asOf, provenance,
    })
    draft.add(`Root-zone moisture sits at the ${percentile}th percentile of its historical distribution.`)
  } else {
    draft.infoGaps.push(
      'The root-zone moisture percentile is unavailable: no real multi-year climatology baseline '
      + 'is connected, so no percentile was estimated.',
    )
  }

  const temperatureClauses: string[] = []
  if (indicators.soilTempAvg7d !== null) {
    const short = draft.cite({
      label: 'Soil temperature, short window', unit: '°C', value: indicators.soilTempAvg7d,
      period: indicators.asOf, provenance,
    })
    temperatureClauses.push(`a short-window average of ${short} °C`)
  }
  if (indicators.soilTempAvg10d !== null) {
    const long = draft.cite({
      label: 'Soil temperature, longer window', unit: '°C', value: indicators.soilTempAvg10d,
      period: indicators.asOf, provenance,
    })
    temperatureClauses.push(`a longer-window average of ${long} °C`)
  }
  if (temperatureClauses.length > 0) {
    draft.add(`Soil temperature shows ${temperatureClauses.join(' and ')}.`)
  }

  if (clauses.length === 0 && indicators.moistureAnomalyPctl === null && temperatureClauses.length === 0) {
    draft.add('The soil-moisture series has no usable values for this window.')
  }

  draft.add('Soil moisture and soil temperature come from the regional NASA POWER land-surface model, not from field sensors on this plot.')
}

function answerTemperature(draft: Draft, indicators: PlotIndicators): void {
  const provenance = indicators.rainfallProvenance
  if (!provenance || indicators.airTempAvg === null) {
    draft.add('No air-temperature series is available for the analysis window.')
    draft.infoGaps.push('No climate provenance available for the current indicator window.')
    return
  }

  const average = draft.cite({
    label: 'Average air temperature', unit: '°C', value: indicators.airTempAvg,
    period: indicators.asOf, provenance,
  })
  const clauses = [`average air temperature was ${average} °C`]
  if (indicators.airTempMin !== null) {
    const minimum = draft.cite({
      label: 'Minimum air temperature', unit: '°C', value: indicators.airTempMin,
      period: indicators.asOf, provenance,
    })
    clauses.push(`with a minimum of ${minimum} °C`)
  }
  if (indicators.airTempMax !== null) {
    const maximum = draft.cite({
      label: 'Maximum air temperature', unit: '°C', value: indicators.airTempMax,
      period: indicators.asOf, provenance,
    })
    clauses.push(`and a maximum of ${maximum} °C`)
  }
  draft.add(`Over the analysed month, ${clauses.join(' ')}.`)

  const frostDays = draft.cite({
    label: 'Frost days', unit: 'days', value: indicators.frostDays,
    period: indicators.asOf, provenance,
  })
  const heatDays = draft.cite({
    label: 'Heat-stress days', unit: 'days', value: indicators.heatStressDays,
    period: indicators.asOf, provenance,
  })
  draft.add(`The period recorded ${frostDays} frost days and ${heatDays} heat-stress days.`)

  const growingDegreeDays = draft.cite({
    label: 'Accumulated growing degree days', unit: '°C·day', value: indicators.growingDegreeDaysAccum,
    period: indicators.asOf, provenance,
  })
  draft.add(`Accumulated growing degree days are ${growingDegreeDays}.`)

}

function answerNdvi(draft: Draft, indicators: PlotIndicators): void {
  const provenance = indicators.ndviProvenance
  if (!provenance || indicators.ndviAvg === null) {
    draft.add('No valid NDVI observation is available for the analysed month.')
    draft.infoGaps.push('No NDVI provenance available for the current indicator window.')
    return
  }

  const ndvi = draft.cite({
    label: 'Average NDVI', unit: 'index', value: indicators.ndviAvg,
    period: indicators.asOf, provenance,
  })
  draft.add(`The average NDVI for the analysed month is ${ndvi}.`)

  if (indicators.bareSoil !== null) {
    draft.add(
      indicators.bareSoil
        ? 'Most valid observations fall below the bare or sparse-cover threshold.'
        : 'Most valid observations show vegetation cover above the bare-soil threshold.',
    )
  }

  draft.add('NDVI is a satellite composite for the surrounding cell, not a field measurement.')
}

function answerStrategies(draft: Draft, plot: PlotSnapshot, strategies: RotationStrategy[]): void {
  if (strategies.length === 0) {
    draft.add(
      'No rotation strategies have been generated for this plot yet. Generate them first with '
      + 'POST /plots/:id/rotations, then ask again.',
    )
    draft.infoGaps.push('No stored strategy batch for this plot.')
    return
  }

  const asOf = strategies[0].generatedAt.slice(0, 10)
  const count = draft.cite({
    label: 'Stored strategies', unit: 'count', value: strategies.length,
    period: asOf, provenance: computedProvenance(plot, 'rotation strategy batch', asOf),
  })
  const top = [...strategies].sort((a, b) => b.totalScore - a.totalScore)[0]
  const score = draft.cite({
    label: 'Top strategy total score', unit: 'score (0-100)', value: top.totalScore,
    period: asOf, provenance: computedProvenance(plot, 'rotation strategy scoring', asOf),
  })
  const crops = top.sequence.map((season) => season.crop).join(', ')
  draft.add(`The latest batch contains ${count} rotation strategies; the highest total score is ${score}, for a sequence of ${crops}.`)

  if (top.evidence.length > 0) {
    for (const item of top.evidence) {
      draft.evidence.push(item)
    }
    const evidenceText = top.evidence
      .map((item) => `${item.label}: ${item.value} ${item.unit}`)
      .join('; ')
    draft.add(`That strategy's supporting evidence reports ${evidenceText}.`)
  }

  for (const gap of top.infoGaps) {
    draft.infoGaps.push(gap)
  }
  draft.add('Review the listed information gaps and risks before acting on this strategy.')
}

function answerEconomics(draft: Draft, plot: PlotSnapshot, business: BusinessInputs | null | undefined, errors?: string[]): void {
  if (!business) {
    draft.add('There is no recorded cost, yield or price data for this plot, so I will not invent a margin.')
    draft.infoGaps.push(
      'No valid business/current record — recorded costs, yield and price are required to compute a margin.',
    )
    for (const error of errors ?? []) {
      draft.infoGaps.push(error)
    }
    return
  }

  const provenance = recordedBusinessProvenance(plot)
  const period = plot.updatedAt
  const result = computeEconomicResult(business)
  const investment = draft.cite({
    label: 'Total investment', unit: 'MXN', value: result.investment, period, provenance,
  })
  const area = draft.cite({
    label: 'Recorded area', unit: 'ha', value: business.area, period, provenance,
  })
  const price = draft.cite({
    label: 'Recorded price', unit: 'MXN/t', value: business.priceTon, period, provenance,
  })
  const yieldTonHa = draft.cite({
    label: 'Recorded yield', unit: 't/ha', value: business.yieldTonHa, period, provenance,
  })

  draft.add(
    `Using your recorded figures, total investment is ${investment} MXN for ${area} ha, at a price `
    + `of ${price} MXN/t and a yield of ${yieldTonHa} t/ha.`,
  )

  if (result.marginPct !== null) {
    const margin = draft.cite({
      label: 'Margin', unit: '%', value: result.marginPct, period, provenance,
    })
    draft.add(`That is a margin of ${margin}%.`)
  } else {
    draft.infoGaps.push('Margin is undefined because recorded revenue is zero.')
  }

  if (result.breakEvenYield !== null) {
    const breakEven = draft.cite({
      label: 'Break-even yield', unit: 't/ha', value: result.breakEvenYield, period, provenance,
    })
    draft.add(`The break-even yield is ${breakEven} t/ha.`)
  }

  if (result.costPerHa !== null) {
    const costPerHa = draft.cite({
      label: 'Cost per hectare', unit: 'MXN/ha', value: result.costPerHa, period, provenance,
    })
    draft.add(`Cost per hectare is ${costPerHa} MXN/ha.`)
  }

  draft.add('These are your own recorded numbers, not model defaults.')
}

function answerMarket(draft: Draft, plot: PlotSnapshot, price: PriceSnapshot | null | undefined): void {
  if (!price) {
    draft.add('No price snapshot is available for this plot\'s current crop.')
    draft.infoGaps.push('No price snapshot available for the current crop/municipality.')
    return
  }

  for (const gap of price.infoGaps) {
    draft.infoGaps.push(gap)
  }

  const provenance = price.provenance
  if (!provenance) {
    draft.add(
      `No real price or yield record is available for ${plot.currentCrop} in ${plot.municipality}, `
      + 'so no market figure is reported.',
    )
    return
  }

  const period = provenance.asOf
  const clauses: string[] = []

  if (price.ruralAvgPriceKg !== null) {
    const rural = draft.cite({
      label: 'Rural average price', unit: 'MXN/kg', value: price.ruralAvgPriceKg, period, provenance,
    })
    clauses.push(`a rural average of ${rural} MXN/kg`)
  }
  if (price.yieldTonHa !== null) {
    const yieldTonHa = draft.cite({
      label: 'Expected yield', unit: 't/ha', value: price.yieldTonHa, period, provenance,
    })
    clauses.push(`an expected yield of ${yieldTonHa} t/ha`)
  }

  if (clauses.length > 0) {
    draft.add(
      `The latest available record for ${plot.currentCrop} in ${plot.municipality} shows `
      + `${clauses.join(' and ')}.`,
    )
  }

  if (price.wholesalePriceKg !== null) {
    const wholesale = draft.cite({
      label: 'Wholesale price', unit: 'MXN/kg', value: price.wholesalePriceKg, period, provenance,
    })
    draft.add(`The wholesale price is ${wholesale} MXN/kg.`)
  }

  if (price.guaranteedPriceTon !== null) {
    const guaranteed = draft.cite({
      label: 'Guaranteed price', unit: 'MXN/t', value: price.guaranteedPriceTon, period, provenance,
    })
    draft.add(`The guaranteed price for qualifying small producers is ${guaranteed} MXN/t.`)
  }

  draft.add(
    provenance.origin === 'simulated'
      ? 'This price snapshot is simulated and must not be presented as a live market quote.'
      : 'This is a real annual SIAP municipal figure, not a live market quote.',
  )
}

function answerPlot(draft: Draft, plot: PlotSnapshot): void {
  const provenance = recordedPlotProvenance(plot)
  const period = plot.updatedAt

  const area = draft.cite({
    label: 'Declared area', unit: 'ha', value: plot.areaHa, period, provenance,
  })
  const latitude = draft.cite({
    label: 'Latitude', unit: 'degrees', value: plot.center.lat, period, provenance,
    decimals: COORDINATE_DECIMALS,
  })
  const longitude = draft.cite({
    label: 'Longitude', unit: 'degrees', value: plot.center.lon, period, provenance,
    decimals: COORDINATE_DECIMALS,
  })
  const elevation = draft.cite({
    label: 'Elevation', unit: 'm', value: plot.elevationM, period, provenance,
  })

  draft.add(
    // No "WGS84" here on purpose: the grounding check reads every digit in the prose as a
    // figure, and a datum label would look like an unsupported number.
    `This plot covers ${area} ha at ${latitude}, ${longitude} in decimal degrees, at an elevation of `
    + `${elevation} m. It is managed as ${plot.mode}, its current crop is ${plot.currentCrop}, `
    + `and it is located in ${plot.municipality}, ${plot.state}.`,
  )

  const geometry = analyzePlotGeometry(plot)
  if (geometry.areaHa !== null) {
    const polygonArea = draft.cite({
      label: 'Stored polygon surface', unit: 'ha', value: geometry.areaHa, period,
      provenance: computedProvenance(plot, 'polygon area', period.slice(0, 10)),
    })
    draft.add(`The stored boundary encloses ${polygonArea} ha.`)
  }
  for (const gap of geometry.infoGaps) {
    draft.infoGaps.push(gap)
  }
}

function answerUnknown(draft: Draft): void {
  draft.add(
    'I can answer with this plot\'s recorded data about rainfall and water balance, soil moisture, '
    + 'temperature and frost or heat risk, NDVI, rotation strategies, recorded costs and margins, '
    + 'market prices, and basic plot facts. I will not answer with figures that are not in those records.',
  )
  draft.infoGaps.push('The question did not match a supported intent, so no data figures were returned.')
}

export function buildViaAnswer(intent: ViaIntent, context: ViaContext): ViaAnswer {
  const draft = new Draft()
  const { plot } = context

  switch (intent) {
    case 'water':
      if (context.indicators) {
        answerWater(draft, context.indicators)
      }
      break
    case 'soilMoisture':
      if (context.indicators) {
        answerSoilMoisture(draft, context.indicators)
      }
      break
    case 'temperature':
      if (context.indicators) {
        answerTemperature(draft, context.indicators)
      }
      break
    case 'ndvi':
      if (context.indicators) {
        answerNdvi(draft, context.indicators)
      }
      break
    case 'strategies':
      answerStrategies(draft, plot, context.strategies ?? [])
      break
    case 'economics':
      answerEconomics(draft, plot, context.business, context.businessErrors)
      break
    case 'market':
      answerMarket(draft, plot, context.price)
      break
    case 'plot':
      answerPlot(draft, plot)
      break
    case 'unknown':
      answerUnknown(draft)
      break
  }

  if (draft.evidence.length === 0 && draft.infoGaps.length === 0) {
    draft.infoGaps.push('No data was available to answer this question.')
  }

  const answer = draft.build()
  assertGrounded(answer, draft.evidence)
  return { intent, answer, evidence: draft.evidence, infoGaps: draft.infoGaps }
}
