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

  it('rejects the wrong key, and accepts the right one, when a key is actually configured', async () => {
    const original = process.env.INTERNAL_SERVICE_KEY
    process.env.INTERNAL_SERVICE_KEY = 'configured-test-key'
    try {
      const wrong = await request(createApp()).post('/internal/ingest/power')
        .set('x-service-key', 'wrong').send({})
      expect(wrong.status).toBe(401)

      const right = await request(createApp()).post('/internal/ingest/power')
        .set('x-service-key', 'configured-test-key')
        .send({
          cellId: 'power:24.0:-104.375', date: '2026-01-01', values: { T2M: 20 },
          provenance: {
            source: 'test', product: 'test', version: 'v1', asOf: '2026-01-01',
            latencyDays: 0, kind: 'historical', origin: 'simulated',
          },
        })
      expect(right.status).not.toBe(401)
    } finally {
      process.env.INTERNAL_SERVICE_KEY = original
    }
  })
})
