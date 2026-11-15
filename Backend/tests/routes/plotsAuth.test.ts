import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'
import { getAdminFirestore } from '../../src/firestore/admin'
import { seedCropCatalog } from '../../src/seed/cropCatalog.seed'
import { seedDemoPlot, DEMO_PLOT_ID } from '../../src/seed/demoPlot.seed'
import { mintIdTokenForUid } from '../helpers/fakeIdToken'

describe('plots/:id auth', () => {
  let ownerToken: string
  let strangerToken: string

  beforeAll(async () => {
    const db = getAdminFirestore()
    await seedCropCatalog(db)
    await seedDemoPlot(db)
    ownerToken = await mintIdTokenForUid('demo-owner')
    strangerToken = await mintIdTokenForUid('someone-else')
  })

  it('rejects a request with no token', async () => {
    const res = await request(createApp()).get(`/plots/${DEMO_PLOT_ID}/indicators`)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('rejects a malformed Authorization header', async () => {
    const res = await request(createApp())
      .get(`/plots/${DEMO_PLOT_ID}/indicators`)
      .set('authorization', 'not-a-bearer-token')
    expect(res.status).toBe(401)
  })

  it('rejects a token belonging to a different uid than the plot owner', async () => {
    const res = await request(createApp())
      .get(`/plots/${DEMO_PLOT_ID}/indicators`)
      .set('authorization', `Bearer ${strangerToken}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('forbidden')
  })

  it("lets the plot's owner through", async () => {
    const res = await request(createApp())
      .get(`/plots/${DEMO_PLOT_ID}/indicators`)
      .set('authorization', `Bearer ${ownerToken}`)
    expect(res.status).toBe(200)
  })

  it('does not leak plot existence: an unknown plot id still 404s rather than 403ing a stranger', async () => {
    const res = await request(createApp())
      .get('/plots/does-not-exist/indicators')
      .set('authorization', `Bearer ${strangerToken}`)
    expect(res.status).toBe(404)
  })
})
