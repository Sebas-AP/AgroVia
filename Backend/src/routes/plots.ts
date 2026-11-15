import { Router } from 'express'
import { getAdminFirestore } from '../firestore/admin'
import { COLLECTIONS } from '../firestore/collections'
import { computeCellId } from '../firestore/cellId'
import { notFound, badRequest } from '../middleware/errorHandler'
import { plotOwnerAuth } from '../middleware/plotOwnerAuth'
import { computeIndicators } from '../engines/indicators'
import { generateStrategies } from '../engines/rotation'
import { computeEconomicResult, computeScenarioPrices } from '../engines/economics'
import { SimulatedClimateProvider } from '../providers/ClimateProvider'
import { SimulatedSoilMoistureProvider } from '../providers/SoilMoistureProvider'
import { SimulatedNdviProvider, ModeloNdviProvider, type NdviProvider } from '../providers/NdviProvider'
import { SimulatedSoilProvider } from '../providers/SoilProvider'
import { SimulatedPricesProvider, type PricesProvider } from '../providers/PricesProvider'
import { ModeloClient } from '../integration/modeloClient'
import type { PlotSnapshot, CropCatalogEntry } from '../types/firestoreDocs'
import type { BusinessInputs } from '../types/business'
import type { RotationStrategy } from '../types/strategy'

export const plotsRouter = Router()

plotsRouter.use('/plots/:id', plotOwnerAuth)

const climateProvider = new SimulatedClimateProvider()
const soilMoistureProvider = new SimulatedSoilMoistureProvider()
const soilProvider = new SimulatedSoilProvider()
const pricesProvider = new SimulatedPricesProvider()

// USE_SIMULATED_PROVIDERS=false switches NDVI to the real Modelo-backed provider once
// MODELO_BASE_URL is set. Climate and crop-criteria stay simulated regardless — see
// INTEGRACION.md for the documented contract gaps (Modelo's /clima is a window aggregate, not
// a daily series the indicators engine could use without fabricating values; its INIFAP
// catalogue doesn't carry the rotation-scoring fields cropCatalog needs). Never silently
// decided here: this file just reflects what's actually implemented.
const useSimulatedProviders = process.env.USE_SIMULATED_PROVIDERS !== 'false'
const ndviProvider: NdviProvider = (!useSimulatedProviders && process.env.MODELO_BASE_URL)
  ? new ModeloNdviProvider(new ModeloClient({ baseUrl: process.env.MODELO_BASE_URL }))
  : new SimulatedNdviProvider()

async function getPlotOrThrow(id: string): Promise<PlotSnapshot> {
  const doc = await getAdminFirestore().collection(COLLECTIONS.plots).doc(id).get()
  if (!doc.exists) {
    throw notFound(`Plot "${id}" was not found.`)
  }
  return doc.data() as PlotSnapshot
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

async function computeCurrentIndicators(plot: PlotSnapshot, catalog: CropCatalogEntry[]) {
  const to = daysAgo(0)
  const from = daysAgo(30)
  const month = to.slice(0, 7)
  const modisCellId = computeCellId(plot.center.lat, plot.center.lon, 'modis')

  const [climate, soilMoisture, ndvi] = await Promise.all([
    climateProvider.getDailySeries(plot.powerCellId, from, to),
    soilMoistureProvider.getDailySeries(plot.smapCellId, from, to),
    ndviProvider.getSeries(modisCellId, from, to),
  ])

  const cropBaseTempC = catalog.find((c) => c.id === plot.currentCrop)?.baseTempC ?? 10

  return computeIndicators({ plotId: plot.name, month, climate, soilMoisture, ndvi, cropBaseTempC })
}

plotsRouter.get('/plots/:id/indicators', async (req, res, next) => {
  try {
    const plot = await getPlotOrThrow(req.params.id)
    const catalogSnapshot = await getAdminFirestore().collection(COLLECTIONS.cropCatalog).get()
    const catalog = catalogSnapshot.docs.map((d) => d.data() as CropCatalogEntry)
    const indicators = await computeCurrentIndicators(plot, catalog)
    res.json(indicators)
  } catch (err) {
    next(err)
  }
})

function numericFieldErrors(body: Record<string, unknown>, fields: string[]): string[] {
  const errors: string[] = []
  for (const field of fields) {
    const value = body[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push(`${field} must be a finite number >= 0`)
    }
  }
  return errors
}

const BUSINESS_NUMERIC_FIELDS = [
  'area', 'seed', 'fertilizer', 'water', 'labor', 'machinery', 'transport', 'other', 'yieldTonHa', 'priceTon',
]

type BusinessValidation = { ok: true; value: BusinessInputs } | { ok: false; errors: string[] }

function validateBusinessInputs(body: Record<string, unknown>): BusinessValidation {
  const errors = numericFieldErrors(body, BUSINESS_NUMERIC_FIELDS)
  if (typeof body.crop !== 'string' || body.crop === '') {
    errors.push('crop must be a non-empty string')
  }
  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, value: body as unknown as BusinessInputs }
}

function parseBusinessInputs(body: Record<string, unknown>): BusinessInputs {
  const result = validateBusinessInputs(body)
  if (!result.ok) {
    throw badRequest('Invalid business inputs.', result.errors)
  }
  return result.value
}

function defaultBusinessInputs(crop: string, areaHa: number, yieldTonHa: number): BusinessInputs {
  return {
    crop, area: areaHa, seed: 50 * areaHa, fertilizer: 80 * areaHa, water: 20 * areaHa,
    labor: 100 * areaHa, machinery: 60 * areaHa, transport: 30 * areaHa, other: 10 * areaHa,
    yieldTonHa, priceTon: 0,
  }
}

function hasNullRatio(result: { costPerTon: number | null; marginPct: number | null; breakEvenYield: number | null }): boolean {
  return result.costPerTon === null || result.marginPct === null || result.breakEvenYield === null
}

async function fetchPriceHistory(crop: string, municipality: string, months: number): Promise<{ priceTon: number }[]> {
  const dates = Array.from({ length: months }, (_, i) => daysAgo(i * 30))
  const snapshots = await Promise.all(dates.map((date) => pricesProvider.getSnapshot(crop, municipality, date)))
  return snapshots.map((snapshot) => ({ priceTon: snapshot.ruralAvgPriceKg * 1000 }))
}

function primaryCropOf(strategy: RotationStrategy, plot: PlotSnapshot): string {
  // Strategy A's sequence is sorted by historical year, so its first entry is the OLDEST
  // season, not the plot's current crop — price it by plot.currentCrop instead.
  return (strategy.type === 'current' ? plot.currentCrop : strategy.sequence[0]?.crop) ?? plot.currentCrop
}

interface CropPriceData {
  priceSnapshot: Awaited<ReturnType<PricesProvider['getSnapshot']>>
  priceHistory: { priceTon: number }[]
}

// Fetched once per distinct crop across the whole batch of strategies, not once per strategy —
// with 7 strategies that used to mean 90+ serial calls for what's really at most a handful of
// distinct crops (defect (d)).
async function fetchPriceDataByCrop(
  crops: string[], municipality: string, asOfDate: string,
): Promise<Map<string, CropPriceData>> {
  const distinctCrops = [...new Set(crops)]
  const entries = await Promise.all(distinctCrops.map(async (crop): Promise<[string, CropPriceData]> => {
    const [priceSnapshot, priceHistory] = await Promise.all([
      pricesProvider.getSnapshot(crop, municipality, asOfDate),
      fetchPriceHistory(crop, municipality, 12),
    ])
    return [crop, { priceSnapshot, priceHistory }]
  }))
  return new Map(entries)
}

plotsRouter.post('/plots/:id/rotations', async (req, res, next) => {
  try {
    const plot = await getPlotOrThrow(req.params.id)
    const db = getAdminFirestore()

    const [seasonsSnapshot, catalogSnapshot, businessSnapshot] = await Promise.all([
      db.collection(COLLECTIONS.plotSeasons(req.params.id)).get(),
      db.collection(COLLECTIONS.cropCatalog).get(),
      db.doc(COLLECTIONS.plotBusinessCurrent(req.params.id)).get(),
    ])
    const seasons = seasonsSnapshot.docs.map((d) => d.data() as { year: number; crop: string })
    const catalog = catalogSnapshot.docs.map((d) => d.data() as CropCatalogEntry)
    const staticProfile = await soilProvider.getStaticProfile(plot.center.lat, plot.center.lon)
    const indicators = await computeCurrentIndicators(plot, catalog)

    const strategies = generateStrategies({
      plot, staticProfile, seasons, priorities: plot.priorities, indicators, catalog,
    })

    let business: BusinessInputs | null = null
    if (businessSnapshot.exists) {
      const validated = validateBusinessInputs(businessSnapshot.data() as Record<string, unknown>)
      if (validated.ok) {
        business = validated.value
      }
    }

    const asOfDate = daysAgo(0)
    // 12 points so the 10th-percentile "drop" scenario doesn't collapse to the same index (0)
    // as the plain minimum "floor" uses when the plot is too large for the guaranteed-price
    // floor — floor(0.1 * (n-1)) only moves off index 0 once n >= 11.
    const priceDataByCrop = await fetchPriceDataByCrop(
      strategies.map((s) => primaryCropOf(s, plot)), plot.municipality, asOfDate,
    )

    for (const strategy of strategies) {
      const primaryCrop = primaryCropOf(strategy, plot)
      const catalogEntry = catalog.find((c) => c.id === primaryCrop)
      const { priceSnapshot, priceHistory } = priceDataByCrop.get(primaryCrop)!

      strategy.evidence.push({
        label: 'Rural average price', value: String(priceSnapshot.ruralAvgPriceKg), unit: 'MXN/kg',
        period: asOfDate, provenance: priceSnapshot.provenance,
      })

      const scenarioPrices = computeScenarioPrices({ ...priceSnapshot, areaHa: plot.areaHa }, priceHistory)

      // The farmer's one business/current record is for a single crop — only apply it to the
      // strategy whose primary crop matches; every other strategy (and this one, when there's
      // no match) falls back to simulated per-hectare defaults, with the gap recorded.
      let baseInputs: BusinessInputs
      if (business && business.crop === primaryCrop) {
        baseInputs = business
      } else {
        if (businessSnapshot.exists && !business) {
          strategy.infoGaps.push('Stored business/current data is invalid — using simulated defaults.')
        } else if (!businessSnapshot.exists) {
          strategy.infoGaps.push('No recorded business/current costs for this plot — using simulated defaults.')
        } else if (business) {
          strategy.infoGaps.push(
            `Recorded business costs are for "${business.crop}", not "${primaryCrop}" — using simulated defaults for this crop.`,
          )
        }
        baseInputs = defaultBusinessInputs(
          primaryCrop, plot.areaHa, catalogEntry ? priceSnapshot.yieldTonHa : 0,
        )
      }

      for (const [scenario, priceTon] of Object.entries(scenarioPrices) as [RotationStrategy['economics'][number]['scenario'], number | null][]) {
        if (priceTon === null) {
          strategy.infoGaps.push(`${scenario} price scenario has no value for this crop/area.`)
          continue
        }
        const result = computeEconomicResult({ ...baseInputs, priceTon })
        if (hasNullRatio(result)) {
          strategy.infoGaps.push(`${scenario} scenario: some economic ratios are undefined (zero production or price).`)
        }
        strategy.economics.push({ scenario, priceTon, result })
      }

      const averageScenario = strategy.economics.find((e) => e.scenario === 'average')
      if (averageScenario && averageScenario.result.marginPct !== null) {
        strategy.summary.avgMarginPct = averageScenario.result.marginPct
        strategy.summary.avgProfitMxn = averageScenario.result.profit
      } else {
        strategy.infoGaps.push('Average-scenario margin is undefined — the card summary has no value to show.')
      }
    }

    const generatedAt = new Date().toISOString()
    const batch = db.batch()
    for (const strategy of strategies) {
      strategy.generatedAt = generatedAt
      const docRef = db.collection(COLLECTIONS.strategies).doc()
      batch.set(docRef, { ...strategy, plotId: req.params.id })
    }
    await batch.commit()

    res.json({ strategies })
  } catch (err) {
    next(err)
  }
})

plotsRouter.get('/plots/:id/rotations', async (req, res, next) => {
  try {
    await getPlotOrThrow(req.params.id)
    const snapshot = await getAdminFirestore()
      .collection(COLLECTIONS.strategies)
      .where('plotId', '==', req.params.id)
      .orderBy('generatedAt', 'desc')
      .limit(20)
      .get()

    if (snapshot.empty) {
      res.json({ strategies: [] })
      return
    }

    const latestGeneratedAt = snapshot.docs[0].data().generatedAt
    const strategies = snapshot.docs
      .map((d) => d.data())
      .filter((s) => s.generatedAt === latestGeneratedAt)

    res.json({ strategies })
  } catch (err) {
    next(err)
  }
})

plotsRouter.post('/plots/:id/economics', async (req, res, next) => {
  try {
    await getPlotOrThrow(req.params.id)
    const inputs = parseBusinessInputs(req.body as Record<string, unknown>)
    const result = computeEconomicResult(inputs)
    res.json({ result })
  } catch (err) {
    next(err)
  }
})
