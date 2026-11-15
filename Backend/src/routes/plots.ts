import { Router } from 'express'
import { getAdminFirestore } from '../firestore/admin'
import { COLLECTIONS } from '../firestore/collections'
import { computeCellId } from '../firestore/cellId'
import { notFound, badRequest } from '../middleware/errorHandler'
import { plotOwnerAuth } from '../middleware/plotOwnerAuth'
import { computeIndicators } from '../engines/indicators'
import { generateStrategies } from '../engines/rotation'
import { computeEconomicResult, computeScenarioPrices } from '../engines/economics'
import { runtimeProviders } from '../providers/runtime'
import type { PricesProvider } from '../providers/PricesProvider'
import type { ModeloClient } from '../integration/modeloClient'
import { toModeloCropId } from '../integration/modeloCropIds'
import { analyzePlotGeometry, plotPointForLookup } from '../geo/plotGeometry'
import { classifyIntent } from '../engines/via/intents'
import { buildViaAnswer, type ViaContext } from '../engines/via'
import { createAnswerPolisherFromEnv } from '../engines/via/polisher'
import { retrieveCropNotes } from '../engines/via/retrieval'
import { findUnsupportedNumbers } from '../engines/via/verification'
import type { GenerateStrategiesInput } from '../engines/rotation'
import type { PlotSnapshot, CropCatalogEntry } from '../types/firestoreDocs'
import type { BusinessInputs } from '../types/business'
import type { RotationStrategy } from '../types/strategy'

export const plotsRouter = Router()

plotsRouter.use('/plots/:id', plotOwnerAuth)

// All providers switch together in providers/runtime.ts: real when MODELO_BASE_URL is set,
// simulated only on explicit opt-in. Nothing falls back silently from one to the other here.
const {
  modeloClient, climate: climateProvider, soilMoisture: soilMoistureProvider, ndvi: ndviProvider,
  prices: pricesProvider,
} = runtimeProviders
// Null unless ANTHROPIC_API_KEY and VIA_POLISH_MODEL are both configured; the template answer is
// the default and only path otherwise.
const viaAnswerPolisher = createAnswerPolisherFromEnv()
console.warn(`[via-polish] NVIDIA_API_KEY present: ${Boolean(process.env.NVIDIA_API_KEY)}, polisher: ${viaAnswerPolisher ? viaAnswerPolisher.constructor.name : 'null'}`)

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
  // Same point rule as modeloMapper: prefer the polygon centroid when a valid boundary exists,
  // so the satellite lookup matches the actual field rather than a possibly misplaced center.
  const lookupPoint = plotPointForLookup(plot)
  const modisCellId = computeCellId(lookupPoint.lat, lookupPoint.lon, 'modis')

  const [climate, soilMoisture, ndvi] = await Promise.all([
    climateProvider.getDailySeries(plot.powerCellId, from, to),
    // The real soil-moisture provider derives GWETTOP/GWETROOT/TS from the same NASA POWER
    // daily window, so it is keyed by the same power cell (it memoizes the climate series).
    soilMoistureProvider.getDailySeries(plot.powerCellId, from, to),
    // NDVI is supplementary (same principle Modelo's own OrnlMODISClient comment states) — ORNL
    // DAAC being slow or down must not take out climate/soil-moisture too. An empty series makes
    // computeIndicators report ndviAvg/ndviProvenance as null, which the rotation engine already
    // turns into an infoGap rather than fabricating a value.
    ndviProvider.getSeries(modisCellId, from, to).catch(() => []),
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

function hasNullRatio(result: { costPerTon: number | null; marginPct: number | null; breakEvenYield: number | null }): boolean {
  return result.costPerTon === null || result.marginPct === null || result.breakEvenYield === null
}

// Real SIAP history is annual, so the scenario engine receives one real point per available year
// instead of twelve synthetic monthly snapshots.
async function fetchPriceHistory(crop: string, municipality: string): Promise<{ priceTon: number }[]> {
  const points = await pricesProvider.getHistory(crop, municipality)
  return points.map((point) => ({ priceTon: point.priceTon }))
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
  crops: string[], municipality: string, asOfDate: string, mode: 'rainfed' | 'irrigated',
): Promise<Map<string, CropPriceData>> {
  const distinctCrops = [...new Set(crops)]
  const entries = await Promise.all(distinctCrops.map(async (crop): Promise<[string, CropPriceData]> => {
    const [priceSnapshot, priceHistory] = await Promise.all([
      pricesProvider.getSnapshot(crop, municipality, asOfDate, mode),
      fetchPriceHistory(crop, municipality),
    ])
    return [crop, { priceSnapshot, priceHistory }]
  }))
  return new Map(entries)
}

interface ModelSuccessResult {
  byCrop: Record<string, number>
  info?: { name: string; version: string }
  unavailableReason?: string
}

// Modelo's prediction is trained to evaluate a crop against a window of real NASA POWER
// climate, not to forecast an unplanted future rotation — there's no real sowing date or
// cycle-specific window for an "alternative" strategy. ASSUMPTION: the last 30 days' aggregate
// (the same real window the indicators engine already fetched climate for) stands in as
// "current regional conditions" for every candidate crop, documented here for review rather
// than silently treated as a true per-cycle forecast.
async function fetchModelSuccessByCrop(
  plot: PlotSnapshot, catalog: CropCatalogEntry[], client: ModeloClient,
): Promise<ModelSuccessResult> {
  const to = daysAgo(0)
  const from = daysAgo(30)
  let clima
  let municipio
  try {
    [clima, municipio] = await Promise.all([
      client.clima({ latitud: plot.center.lat, longitud: plot.center.lon, inicio: from, fin: to }),
      client.municipio(plot.center.lat, plot.center.lon),
    ])
  } catch (err) {
    return { byCrop: {}, unavailableReason: `Modelo did not respond: ${String(err)}` }
  }

  const modalidad = plot.mode === 'irrigated' ? 'riego' : 'temporal'
  const predictions = await Promise.all(catalog.map(async (crop) => {
    const modeloCropId = toModeloCropId(crop.id)
    if (!modeloCropId) {
      return null
    }
    try {
      const result = await client.predecir({
        cultivo_id: modeloCropId, modalidad, cve_mun: municipio.cve_mun,
        lluvia_ciclo_mm: clima.lluvia_ciclo_mm, temp_media_c: clima.temp_media_c,
        temp_max_c: clima.temp_max_c, temp_min_extrema_c: clima.temp_min_extrema_c,
        radiacion_mj_m2: clima.radiacion_mj_m2,
      })
      return { backendCropId: crop.id, result }
    } catch {
      return null
    }
  }))

  const byCrop: Record<string, number> = {}
  let info: ModelSuccessResult['info']
  for (const prediction of predictions) {
    if (prediction) {
      byCrop[prediction.backendCropId] = prediction.result.probabilidad_exito
      // EvaluacionModelo has no separate semantic-version field; the joblib filename it does
      // return is the only per-prediction identifier Modelo actually provides.
      info = { name: 'modelo-agrovia', version: prediction.result.modelo }
    }
  }
  if (Object.keys(byCrop).length === 0) {
    return { byCrop, unavailableReason: 'Modelo returned no usable prediction for any crop in the catalog.' }
  }
  return { byCrop, info }
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
    const indicators = await computeCurrentIndicators(plot, catalog)

    const modelSuccess: ModelSuccessResult = modeloClient
      ? await fetchModelSuccessByCrop(plot, catalog, modeloClient)
      : { byCrop: {} }

    const strategies = generateStrategies({
      plot, seasons, priorities: plot.priorities, indicators, catalog,
      modelSuccessByCrop: Object.keys(modelSuccess.byCrop).length > 0 ? modelSuccess.byCrop : undefined,
      modelInfo: modelSuccess.info,
      modelUnavailableReason: modelSuccess.unavailableReason,
    } satisfies GenerateStrategiesInput)

    // The declared area is never overwritten: an invalid stored boundary or a polygon whose
    // surface disagrees with areaHa becomes a visible infoGap on every strategy in this batch.
    const geometryInfo = analyzePlotGeometry(plot)
    if (geometryInfo.infoGaps.length > 0) {
      for (const strategy of strategies) {
        strategy.infoGaps.push(...geometryInfo.infoGaps)
      }
    }

    let business: BusinessInputs | null = null
    if (businessSnapshot.exists) {
      const validated = validateBusinessInputs(businessSnapshot.data() as Record<string, unknown>)
      if (validated.ok) {
        business = validated.value
      }
    }

    const asOfDate = daysAgo(0)
    const priceDataByCrop = await fetchPriceDataByCrop(
      strategies.map((s) => primaryCropOf(s, plot)), plot.municipality, asOfDate, plot.mode,
    )

    for (const strategy of strategies) {
      const primaryCrop = primaryCropOf(strategy, plot)
      const { priceSnapshot, priceHistory } = priceDataByCrop.get(primaryCrop)!

      // SIAP is annual: the evidence period is the dataset year's closing date, not today.
      if (priceSnapshot.ruralAvgPriceKg !== null && priceSnapshot.provenance) {
        strategy.evidence.push({
          label: 'Rural average price', value: String(priceSnapshot.ruralAvgPriceKg), unit: 'MXN/kg',
          period: priceSnapshot.provenance.asOf, provenance: priceSnapshot.provenance,
        })
      }
      strategy.infoGaps.push(...priceSnapshot.infoGaps)

      const scenarioPrices = computeScenarioPrices(
        {
          ruralAvgPriceKg: priceSnapshot.ruralAvgPriceKg,
          wholesalePriceKg: priceSnapshot.wholesalePriceKg,
          guaranteedPriceTon: priceSnapshot.guaranteedPriceTon,
          areaHa: plot.areaHa,
        },
        priceHistory,
      )

      // The farmer's one business/current record is for a single crop. Without a valid record
      // for this strategy's crop there is no economic result at all — default per-hectare costs
      // are never invented to fill the block.
      const businessForCrop = business && business.crop === primaryCrop ? business : null
      if (!businessForCrop) {
        if (businessSnapshot.exists && !business) {
          strategy.infoGaps.push(
            'Stored business/current data is invalid — no economic result is shown rather than inventing costs.',
          )
        } else if (!businessSnapshot.exists) {
          strategy.infoGaps.push(
            'No recorded business/current costs for this plot — register your costs to see an economic result.',
          )
        } else if (business) {
          strategy.infoGaps.push(
            `Recorded business costs are for "${business.crop}", not "${primaryCrop}" — no economic result is shown for this crop.`,
          )
        }
        continue
      }

      for (const [scenario, priceTon] of Object.entries(scenarioPrices) as [RotationStrategy['economics'][number]['scenario'], number | null][]) {
        if (priceTon === null) {
          strategy.infoGaps.push(
            `${scenario} price scenario has no real source for this crop/area, so it was left out.`,
          )
          continue
        }
        const result = computeEconomicResult({ ...businessForCrop, priceTon })
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

async function loadLatestStrategies(plotId: string): Promise<RotationStrategy[]> {
  const snapshot = await getAdminFirestore()
    .collection(COLLECTIONS.strategies)
    .where('plotId', '==', plotId)
    .orderBy('generatedAt', 'desc')
    .limit(20)
    .get()

  if (snapshot.empty) {
    return []
  }

  const latestGeneratedAt = snapshot.docs[0].data().generatedAt
  return snapshot.docs
    .map((doc) => doc.data() as RotationStrategy)
    .filter((strategy) => strategy.generatedAt === latestGeneratedAt)
}

plotsRouter.get('/plots/:id/rotations', async (req, res, next) => {
  try {
    await getPlotOrThrow(req.params.id)
    res.json({ strategies: await loadLatestStrategies(req.params.id) })
  } catch (err) {
    next(err)
  }
})

const MAX_VIA_QUESTION_LENGTH = 500

function parseViaQuestion(body: unknown): string {
  const question = (body as { question?: unknown } | null)?.question
  if (typeof question !== 'string' || question.trim() === '') {
    throw badRequest('question must be a non-empty string.')
  }
  const trimmed = question.trim()
  if (trimmed.length > MAX_VIA_QUESTION_LENGTH) {
    throw badRequest(`question must be at most ${MAX_VIA_QUESTION_LENGTH} characters.`)
  }
  return trimmed
}

// VÍA is a plot-scoped assistant: /plots/:id/via/ask keeps plotOwnerAuth's owner check, and the
// answer is built only from this plot's stored/derived data.
plotsRouter.post('/plots/:id/via/ask', async (req, res, next) => {
  try {
    const question = parseViaQuestion(req.body)
    const intent = classifyIntent(question)
    const plot = await getPlotOrThrow(req.params.id)
    const context: ViaContext = { plot }

    if (intent === 'water' || intent === 'soilMoisture' || intent === 'temperature' || intent === 'ndvi') {
      const catalogSnapshot = await getAdminFirestore().collection(COLLECTIONS.cropCatalog).get()
      const catalog = catalogSnapshot.docs.map((doc) => doc.data() as CropCatalogEntry)
      context.indicators = await computeCurrentIndicators(plot, catalog)
    }

    if (intent === 'strategies') {
      context.strategies = await loadLatestStrategies(req.params.id)
    }

    if (intent === 'economics') {
      const businessSnapshot = await getAdminFirestore()
        .doc(COLLECTIONS.plotBusinessCurrent(req.params.id))
        .get()
      context.business = null
      if (businessSnapshot.exists) {
        const validated = validateBusinessInputs(businessSnapshot.data() as Record<string, unknown>)
        if (validated.ok) {
          context.business = validated.value
        } else {
          context.businessErrors = validated.errors
        }
      }
    }

    if (intent === 'market') {
      context.price = await pricesProvider.getSnapshot(
        plot.currentCrop, plot.municipality, daysAgo(0), plot.mode,
      )
    }

    const answer = buildViaAnswer(intent, context)

    // Optional AI rewriting: only accepted when every figure it returns is already in the
    // evidence. Otherwise the verified template answer is returned untouched.
    if (viaAnswerPolisher) {
      const retrievedContext = modeloClient
        ? await retrieveCropNotes(modeloClient, question, plot.currentCrop).catch(() => '')
        : ''
      const polished = await viaAnswerPolisher.polish({
        question, answer: answer.answer, evidence: answer.evidence, retrievedContext,
      })
      if (polished !== null) {
        if (findUnsupportedNumbers(polished, answer.evidence).length === 0) {
          answer.answer = polished
        } else {
          answer.infoGaps.push(
            'AI rewriting was discarded because it introduced figures not present in the evidence.',
          )
        }
      }
    }

    res.json(answer)
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
