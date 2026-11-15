import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'
import { getAdminFirestore } from '../../src/firestore/admin'
import { COLLECTIONS } from '../../src/firestore/collections'
import { seedCropCatalog } from '../../src/seed/cropCatalog.seed'
import { seedDemoPlot, DEMO_PLOT_ID } from '../../src/seed/demoPlot.seed'
import { mintIdTokenForUid } from '../helpers/fakeIdToken'
import { findUnsupportedNumbers } from '../../src/engines/via/verification'
import type { Evidence } from '../../src/types/provenance'

const POLYGON_PLOT_ID = 'test-polygon-mismatch'
const POLYGON_DOC_PATH = `plots/${POLYGON_PLOT_ID}`

let ownerToken: string
let strangerToken: string

beforeAll(async () => {
  const db = getAdminFirestore()
  await seedCropCatalog(db)
  await seedDemoPlot(db)
  ownerToken = await mintIdTokenForUid('demo-owner')
  strangerToken = await mintIdTokenForUid('someone-else')

  // A clone of the demo plot whose boundary is roughly four times its declared 9.6 ha.
  const demo = await db.doc(`plots/${DEMO_PLOT_ID}`).get()
  const polygon = [
    { lat: 24.447, lon: -104.126 },
    { lat: 24.447, lon: -104.118 },
    { lat: 24.453, lon: -104.118 },
    { lat: 24.453, lon: -104.126 },
  ]
  await db.doc(POLYGON_DOC_PATH).set({
    ...demo.data(),
    name: 'Plot with a boundary that disagrees with its declared area',
    areaHa: 9.6,
    polygon,
  })
  await db.doc(COLLECTIONS.plotBusinessCurrent(POLYGON_PLOT_ID)).delete()
})

afterAll(async () => {
  await getAdminFirestore().recursiveDelete(getAdminFirestore().doc(POLYGON_DOC_PATH))
})

function ask(question: unknown, plotId = DEMO_PLOT_ID, token = ownerToken) {
  return request(createApp())
    .post(`/plots/${plotId}/via/ask`)
    .set('authorization', `Bearer ${token}`)
    .send({ question })
}

function expectGrounded(body: { answer: string; evidence: Evidence[] }): void {
  expect(typeof body.answer).toBe('string')
  expect(body.answer.length).toBeGreaterThan(0)
  expect(findUnsupportedNumbers(body.answer, body.evidence)).toEqual([])
}

describe('POST /plots/:id/via/ask auth', () => {
  it('rejects a request with no token', async () => {
    const res = await request(createApp())
      .post(`/plots/${DEMO_PLOT_ID}/via/ask`)
      .send({ question: '¿Cuánta lluvia cayó?' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
  })

  it('rejects a token belonging to a different uid than the plot owner', async () => {
    const res = await ask('¿Cuánta lluvia cayó?', DEMO_PLOT_ID, strangerToken)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('forbidden')
  })

  it('404s an unknown plot without revealing anything to a stranger', async () => {
    const res = await ask('¿Cuánta lluvia cayó?', 'does-not-exist', strangerToken)
    expect(res.status).toBe(404)
  })
})

describe('POST /plots/:id/via/ask validation', () => {
  it.each([
    ['a missing question', {}],
    ['an empty question', { question: '   ' }],
    ['a non-string question', { question: 42 }],
    ['an over-long question', { question: 'a'.repeat(501) }],
  ])('rejects %s with a 400', async (_label, body) => {
    const res = await request(createApp())
      .post(`/plots/${DEMO_PLOT_ID}/via/ask`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send(body)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('bad_request')
  })
})

describe('POST /plots/:id/via/ask answers', () => {
  it('answers a rainfall question from the plot indicators with grounded figures', async () => {
    const res = await ask('¿Cuánta lluvia cayó este mes?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('water')
    expect(res.body.evidence.length).toBeGreaterThan(0)
    expectGrounded(res.body)
  })

  it('answers a soil-moisture question with soil evidence', async () => {
    const res = await ask('¿Cómo está la humedad del suelo?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('soilMoisture')
    expect(res.body.evidence.length).toBeGreaterThan(0)
    expectGrounded(res.body)
  })

  it('answers a temperature question and reports frost risk', async () => {
    const res = await ask('¿Hay riesgo de helada?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('temperature')
    expect(res.body.answer).toMatch(/frost days/)
    expectGrounded(res.body)
  })

  it('answers a market question and labels the simulated price as simulated', async () => {
    const res = await ask('¿A cómo está el precio del maíz?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('market')
    expect(res.body.answer).toMatch(/simulated/)
    expectGrounded(res.body)
  })

  it('answers strategy questions from the stored batch after a rotations run', async () => {
    await request(createApp())
      .post(`/plots/${DEMO_PLOT_ID}/rotations`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({})

    const res = await ask('¿Qué rotación me recomiendas?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('strategies')
    expect(res.body.evidence.length).toBeGreaterThan(0)
    expectGrounded(res.body)
  })

  it('refuses to invent a margin when no business record exists', async () => {
    const res = await ask('¿Cuál es mi margen de ganancia?', POLYGON_PLOT_ID)
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('economics')
    expect(res.body.evidence).toEqual([])
    expect(res.body.infoGaps.join(' ')).toMatch(/business\/current record/)
    expectGrounded(res.body)
  })

  it('answers a plot question without inventing figures', async () => {
    const res = await ask('¿Cuántas hectáreas tiene mi parcela?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('plot')
    expectGrounded(res.body)
  })

  it('returns an honest fallback, with no figures, for an unmatched question', async () => {
    const res = await ask('¿Quién ganó el partido de fútbol?')
    expect(res.status).toBe(200)
    expect(res.body.intent).toBe('unknown')
    expect(res.body.evidence).toEqual([])
    expect(res.body.infoGaps.join(' ')).toMatch(/did not match a supported intent/)
  })

  it('is deterministic: the same question twice returns the same answer', async () => {
    const first = await ask('¿Cuánta lluvia cayó este mes?')
    const second = await ask('¿Cuánta lluvia cayó este mes?')
    expect(second.body).toEqual(first.body)
  })
})

describe('POST /plots/:id/rotations polygon geometry', () => {
  it('flags a boundary that disagrees with the declared area without overwriting areaHa', async () => {
    const res = await request(createApp())
      .post(`/plots/${POLYGON_PLOT_ID}/rotations`)
      .set('authorization', `Bearer ${ownerToken}`)
      .send({})

    expect(res.status).toBe(200)
    for (const strategy of res.body.strategies) {
      expect(strategy.infoGaps.join(' ')).toMatch(/declared area is 9.6 ha/)
    }

    const stored = await getAdminFirestore().doc(POLYGON_DOC_PATH).get()
    expect(stored.data()!.areaHa).toBe(9.6)
  })
})
