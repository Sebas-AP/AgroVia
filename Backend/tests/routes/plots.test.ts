import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'
import { getAdminFirestore } from '../../src/firestore/admin'
import { COLLECTIONS } from '../../src/firestore/collections'
import { seedCropCatalog } from '../../src/seed/cropCatalog.seed'
import { seedDemoPlot } from '../../src/seed/demoPlot.seed'
import { mintIdTokenForUid } from '../helpers/fakeIdToken'
import { SimulatedPricesProvider } from '../../src/providers/PricesProvider'

let authHeader: string

beforeAll(async () => {
  const db = getAdminFirestore()
  await seedCropCatalog(db)
  await seedDemoPlot(db)
  // A recorded business/current record is what makes an economic block possible at all; the
  // Backend no longer invents per-hectare defaults when it is missing.
  await db.doc(COLLECTIONS.plotBusinessCurrent('demo-guadalupe-victoria')).set({
    crop: 'corn', area: 9.6, seed: 480, fertilizer: 770, water: 190, labor: 960,
    machinery: 575, transport: 290, other: 95, yieldTonHa: 3.2, priceTon: 4200,
  })
  authHeader = `Bearer ${await mintIdTokenForUid('demo-owner')}`
})

describe('POST /plots/:id/rotations', () => {
  it('returns at least 3 strategies for the demo plot, the current one included', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    expect(res.status).toBe(200)
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(3)
    expect(res.body.strategies.some((s: { type: string }) => s.type === 'current')).toBe(true)
  })

  it('returns a stable error shape for an unknown plot', async () => {
    const res = await request(createApp()).post('/plots/does-not-exist/rotations').set('authorization', authHeader).send({})
    expect(res.status).toBe(404)
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) })
  })

  it('returns strategies with real evidence, and economics only where a business record exists', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    const current = res.body.strategies.find((s: { type: string }) => s.type === 'current')
    expect(current.evidence.length).toBeGreaterThan(0)
    // The seeded business record is for corn, so only the current (corn) strategy can be priced.
    expect(current.economics.length).toBeGreaterThan(0)

    const alternative = res.body.strategies.find((s: { type: string }) => s.type === 'alternative')
    expect(alternative.economics).toEqual([])
    expect(alternative.infoGaps.join(' ')).toMatch(/business costs are for "corn"/)
    expect(alternative.benefits.length).toBeGreaterThan(0)
    expect(alternative.risks.length).toBeGreaterThan(0)
  })

  it('computes summary.avgMarginPct and avgProfitMxn from the average price scenario, not a hardcoded 0', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    const current = res.body.strategies.find((s: { type: string }) => s.type === 'current')
    const averageScenario = current.economics.find((e: { scenario: string }) => e.scenario === 'average')
    expect(current.summary.avgMarginPct).toBe(averageScenario.result.marginPct)
    expect(current.summary.avgProfitMxn).toBe(averageScenario.result.profit)
  })

  it('varies the economics across price scenarios instead of collapsing floor/average/drop to one value', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    const current = res.body.strategies.find((s: { type: string }) => s.type === 'current')
    const byScenario = (name: string) =>
      current.economics.find((e: { scenario: string }) => e.scenario === name)?.priceTon
    // floor/average/drop all derive from the same history; a single-point history would
    // degenerate all three to the same number, so this specifically checks they differ.
    expect(byScenario('floor')).not.toBe(byScenario('drop'))
  })

  it('shows no economic result and records the gap when business/current is invalid', async () => {
    await getAdminFirestore()
      .doc(COLLECTIONS.plotBusinessCurrent('demo-guadalupe-victoria'))
      .set({ crop: 'corn', area: 2, seed: -500, fertilizer: 200, water: 50, labor: 300,
        machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000 })

    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    expect(res.status).toBe(200)
    const current = res.body.strategies.find((s: { type: string }) => s.type === 'current')
    expect(current.infoGaps.join(' ')).toMatch(/invalid/i)
    expect(current.economics).toEqual([])

    await getAdminFirestore().doc(COLLECTIONS.plotBusinessCurrent('demo-guadalupe-victoria')).delete()
  })

  it('fetches each price snapshot and history once per distinct crop, not once per strategy', async () => {
    const snapshotSpy = vi.spyOn(SimulatedPricesProvider.prototype, 'getSnapshot')
    const historySpy = vi.spyOn(SimulatedPricesProvider.prototype, 'getHistory')
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})

    const distinctCrops = new Set(
      res.body.strategies.map((s: { type: string; sequence: { crop: string }[] }) =>
        s.type === 'current' ? 'corn' : s.sequence[0]!.crop),
    )
    // One snapshot + one annual history request per distinct crop; strictly less than the
    // per-strategy count would have been before this was keyed by crop.
    expect(snapshotSpy.mock.calls.length).toBe(distinctCrops.size)
    expect(historySpy.mock.calls.length).toBe(distinctCrops.size)
    expect(snapshotSpy.mock.calls.length + historySpy.mock.calls.length)
      .toBeLessThan(res.body.strategies.length * 2)
    snapshotSpy.mockRestore()
    historySpy.mockRestore()
  })

  it('evidence provenance for climate-derived figures comes from the real provider, not a fixed placeholder', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    const current = res.body.strategies.find((s: { type: string }) => s.type === 'current')
    const rainfall = current.evidence.find((e: { label: string }) => e.label === 'Accumulated rainfall')
    expect(rainfall.provenance.source).toBe('NASA POWER (simulated)')
    expect(rainfall.provenance.kind).toBe('historical')
  })
})

describe('GET /plots/:id/rotations', () => {
  it('returns the last POST-generated strategies rather than regenerating them', async () => {
    const posted = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    const got = await request(createApp()).get('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader)
    expect(got.status).toBe(200)
    expect(got.body.strategies.map((s: { id: string }) => s.id).sort())
      .toEqual(posted.body.strategies.map((s: { id: string }) => s.id).sort())
  })
})

describe('POST /plots/:id/economics', () => {
  it('rejects a negative seed cost before it reaches the economics engine', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/economics').set('authorization', authHeader).send({
      crop: 'corn', area: 2, seed: -100, fertilizer: 200, water: 50, labor: 300,
      machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) })
  })

  it('accepts valid business inputs and returns a computed economic result', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/economics').set('authorization', authHeader).send({
      crop: 'corn', area: 2, seed: 100, fertilizer: 200, water: 50, labor: 300,
      machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000,
    })
    expect(res.status).toBe(200)
    expect(res.body.result.investment).toBe(100 + 200 + 50 + 300 + 150 + 80 + 20)
  })
})

describe('end-to-end with simulated providers: sow a plot, generate rotations, read them back', () => {
  it('produces strategies with complete economics and evidence, readable after the fact', async () => {
    const db = getAdminFirestore()
    const plotId = 'e2e-test-plot'
    const ownerUid = 'e2e-owner'
    const now = new Date().toISOString()

    // "Sembrar": the farmer registers the plot once, with its recorded season history — no
    // separate sowing endpoint exists; this is the same write seedDemoPlot.ts does for the
    // demo plot.
    await db.collection(COLLECTIONS.plots).doc(plotId).set({
      ownerUid, name: 'E2E test plot', center: { lat: 24.44, lon: -104.12 }, areaHa: 7.5,
      mode: 'rainfed', currentCrop: 'corn', declaredSoilType: 'franco', elevationM: 1950,
      country: 'Mexico', state: 'Durango', municipality: 'Guadalupe Victoria', locality: 'Test',
      powerCellId: 'power:24.0:-104.375', gpmCellId: 'gpm:24.4:-104.2', smapCellId: 'smap:24.4:-104.08',
      priorities: { water: 3, income: 3, forage: 2, nitrogen: 2, erosion: 2, organicMatter: 2, market: 2 },
      constraints: { waterAvailability: 'medium', equipment: [] }, origin: 'demo',
      createdAt: now, updatedAt: now,
    })
    await db.collection(COLLECTIONS.plotSeasons(plotId)).doc('2025').set({ year: 2025, crop: 'beans', origin: 'demo' })
    await db.doc(COLLECTIONS.plotBusinessCurrent(plotId)).set({
      crop: 'corn', area: 7.5, seed: 375, fertilizer: 600, water: 150, labor: 750,
      machinery: 450, transport: 225, other: 75, yieldTonHa: 3, priceTon: 4200,
    })

    const ownerToken = `Bearer ${await mintIdTokenForUid(ownerUid)}`

    const posted = await request(createApp()).post(`/plots/${plotId}/rotations`).set('authorization', ownerToken).send({})
    expect(posted.status).toBe(200)
    expect(posted.body.strategies.length).toBeGreaterThanOrEqual(3)

    const got = await request(createApp()).get(`/plots/${plotId}/rotations`).set('authorization', ownerToken)
    expect(got.status).toBe(200)
    expect(got.body.strategies.map((s: { id: string }) => s.id).sort())
      .toEqual(posted.body.strategies.map((s: { id: string }) => s.id).sort())

    for (const strategy of got.body.strategies) {
      expect(strategy.evidence.length).toBeGreaterThan(0)
      if (strategy.type === 'current') {
        // The recorded business record is for corn, so only the current (corn) strategy gets
        // economics. The alternatives are different crops and must not borrow corn's costs.
        expect(strategy.economics.length).toBeGreaterThan(0)
        for (const scenario of strategy.economics) {
          expect(scenario.result).toMatchObject({ investment: expect.any(Number), revenue: expect.any(Number) })
        }
      } else {
        expect(strategy.economics).toEqual([])
        expect(strategy.infoGaps.join(' ')).toMatch(/business costs are for "corn"/)
      }
    }
  })
})
