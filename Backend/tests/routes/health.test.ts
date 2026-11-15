import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'

describe('GET /health', () => {
  it('returns 200 with status ok and the provider data mode', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', dataMode: 'simulated' })
  })
})
