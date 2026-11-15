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

  it('returns strategies with real evidence and economics scenarios, not empty placeholders', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    for (const strategy of res.body.strategies) {
      expect(strategy.evidence.length).toBeGreaterThan(0)
      expect(strategy.economics.length).toBeGreaterThan(0)
    }
    const alternative = res.body.strategies.find((s: { type: string }) => s.type === 'alternative')
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

  it('falls back to simulated defaults and records the gap when business/current is invalid', async () => {
    await getAdminFirestore()
      .doc(COLLECTIONS.plotBusinessCurrent('demo-guadalupe-victoria'))
      .set({ crop: 'corn', area: 2, seed: -500, fertilizer: 200, water: 50, labor: 300,
        machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000 })

    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})
    expect(res.status).toBe(200)
    const current = res.body.strategies.find((s: { type: string }) => s.type === 'current')
    expect(current.infoGaps.join(' ')).toMatch(/invalid/i)
    expect(current.economics.every((e: { result: { investment: number } }) => e.result.investment >= 0)).toBe(true)

    await getAdminFirestore().doc(COLLECTIONS.plotBusinessCurrent('demo-guadalupe-victoria')).delete()
  })

  it('fetches price history once per distinct crop, not once per strategy', async () => {
    const spy = vi.spyOn(SimulatedPricesProvider.prototype, 'getSnapshot')
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').set('authorization', authHeader).send({})

    const distinctCrops = new Set(
      res.body.strategies.map((s: { type: string; sequence: { crop: string }[] }) =>
        s.type === 'current' ? 'corn' : s.sequence[0]!.crop),
    )
    // 1 snapshot + 12 history points per distinct crop; strictly less than per-strategy (13 *
    // strategies) would have taken, proving the fetch is keyed by crop, not by strategy.
    expect(spy.mock.calls.length).toBe(distinctCrops.size * 13)
    expect(spy.mock.calls.length).toBeLessThan(res.body.strategies.length * 13)
    spy.mockRestore()
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
