import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'

describe('POST /internal/ingest/:source', () => {
  it('rejects a request with no service-key header before touching Firestore', async () => {
    const res = await request(createApp()).post('/internal/ingest/power').send({})
    expect(res.status).toBe(401)
  })

  it('rejects a request with the wrong service-key header', async () => {
    const res = await request(createApp()).post('/internal/ingest/power')
      .set('x-service-key', 'wrong').send({})
    expect(res.status).toBe(401)
  })
})
