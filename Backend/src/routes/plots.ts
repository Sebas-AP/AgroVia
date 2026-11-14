import { Router } from 'express'
import { getAdminFirestore } from '../firestore/admin'
import { COLLECTIONS } from '../firestore/collections'
import { computeCellId } from '../firestore/cellId'
import { notFound, badRequest } from '../middleware/errorHandler'
import { computeIndicators } from '../engines/indicators'
import { generateStrategies } from '../engines/rotation'
import { computeEconomicResult, computeScenarioPrices } from '../engines/economics'
import { SimulatedClimateProvider } from '../providers/ClimateProvider'
import { SimulatedSoilMoistureProvider } from '../providers/SoilMoistureProvider'
import { SimulatedNdviProvider } from '../providers/NdviProvider'
import { SimulatedSoilProvider } from '../providers/SoilProvider'
import { SimulatedPricesProvider } from '../providers/PricesProvider'
import type { PlotSnapshot, CropCatalogEntry } from '../types/firestoreDocs'
import type { BusinessInputs } from '../types/business'
import type { RotationStrategy } from '../types/strategy'

export const plotsRouter = Router()

const climateProvider = new SimulatedClimateProvider()
const soilMoistureProvider = new SimulatedSoilMoistureProvider()
const ndviProvider = new SimulatedNdviProvider()
const soilProvider = new SimulatedSoilProvider()
const pricesProvider = new SimulatedPricesProvider()

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

function parseBusinessInputs(body: Record<string, unknown>): BusinessInputs {
  const errors = numericFieldErrors(body, BUSINESS_NUMERIC_FIELDS)
  if (typeof body.crop !== 'string' || body.crop === '') {
    errors.push('crop must be a non-empty string')
  }
  if (errors.length > 0) {
    throw badRequest('Invalid business inputs.', errors)
  }
  return body as unknown as BusinessInputs
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

    const business = businessSnapshot.exists ? (businessSnapshot.data() as BusinessInputs) : null
    const asOfDate = daysAgo(0)

    for (const strategy of strategies) {
      const primaryCrop = strategy.sequence[0]?.crop
      const catalogEntry = catalog.find((c) => c.id === primaryCrop)
      if (!business && catalogEntry) {
        strategy.infoGaps.push('No recorded business/current costs for this plot — using simulated defaults.')
      }

      const priceSnapshot = await pricesProvider.getSnapshot(
        primaryCrop ?? plot.currentCrop, plot.municipality, asOfDate,
      )
      const scenarioPrices = computeScenarioPrices(
        { ...priceSnapshot, areaHa: plot.areaHa },
        [{ priceTon: priceSnapshot.ruralAvgPriceKg * 1000 }],
      )

      const baseInputs: BusinessInputs = business ?? {
        crop: primaryCrop ?? plot.currentCrop,
        area: plot.areaHa, seed: 50 * plot.areaHa, fertilizer: 80 * plot.areaHa, water: 20 * plot.areaHa,
        labor: 100 * plot.areaHa, machinery: 60 * plot.areaHa, transport: 30 * plot.areaHa,
        other: 10 * plot.areaHa, yieldTonHa: catalogEntry ? priceSnapshot.yieldTonHa : 0, priceTon: 0,
      }

      for (const [scenario, priceTon] of Object.entries(scenarioPrices) as [RotationStrategy['economics'][number]['scenario'], number | null][]) {
        if (priceTon === null) {
          continue
        }
        const result = computeEconomicResult({ ...baseInputs, priceTon })
        strategy.economics.push({ scenario, priceTon, result })
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
