import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'
import { getAdminFirestore } from '../../src/firestore/admin'
import { seedCropCatalog } from '../../src/seed/cropCatalog.seed'
import { seedDemoPlot } from '../../src/seed/demoPlot.seed'

beforeAll(async () => {
  const db = getAdminFirestore()
  await seedCropCatalog(db)
  await seedDemoPlot(db)
})

describe('POST /plots/:id/rotations', () => {
  it('returns at least 3 strategies for the demo plot, the current one included', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').send({})
    expect(res.status).toBe(200)
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(3)
    expect(res.body.strategies.some((s: { type: string }) => s.type === 'current')).toBe(true)
  })

  it('returns a stable error shape for an unknown plot', async () => {
    const res = await request(createApp()).post('/plots/does-not-exist/rotations').send({})
    expect(res.status).toBe(404)
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) })
  })
})

describe('GET /plots/:id/rotations', () => {
  it('returns the last POST-generated strategies rather than regenerating them', async () => {
    const posted = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').send({})
    const got = await request(createApp()).get('/plots/demo-guadalupe-victoria/rotations')
    expect(got.status).toBe(200)
    expect(got.body.strategies.map((s: { id: string }) => s.id).sort())
      .toEqual(posted.body.strategies.map((s: { id: string }) => s.id).sort())
  })
})

describe('POST /plots/:id/economics', () => {
  it('rejects a negative seed cost before it reaches the economics engine', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/economics').send({
      crop: 'corn', area: 2, seed: -100, fertilizer: 200, water: 50, labor: 300,
      machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000,
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) })
  })

  it('accepts valid business inputs and returns a computed economic result', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/economics').send({
      crop: 'corn', area: 2, seed: 100, fertilizer: 200, water: 50, labor: 300,
      machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000,
    })
    expect(res.status).toBe(200)
    expect(res.body.result.investment).toBe(100 + 200 + 50 + 300 + 150 + 80 + 20)
  })
})
