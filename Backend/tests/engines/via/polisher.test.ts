import { describe, it, expect, vi } from 'vitest'
import {
  AnthropicAnswerPolisher, createAnswerPolisherFromEnv,
} from '../../../src/engines/via/polisher'
import type { Evidence } from '../../../src/types/provenance'

const EVIDENCE: Evidence[] = [{
  label: 'Accumulated rainfall',
  value: '12.4',
  unit: 'mm',
  period: '2026-11-01',
  provenance: {
    source: 'NASA POWER (simulated)', product: 'AG community daily', version: 'sim-1',
    asOf: '2026-11-01', latencyDays: 0, kind: 'historical', origin: 'simulated',
  },
}]

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('createAnswerPolisherFromEnv', () => {
  it('is disabled by default, with no API key or model configured', () => {
    expect(createAnswerPolisherFromEnv({})).toBeNull()
  })

  it('stays disabled when only one of the two settings is present', () => {
    expect(createAnswerPolisherFromEnv({ ANTHROPIC_API_KEY: 'sk-test' })).toBeNull()
    expect(createAnswerPolisherFromEnv({ VIA_POLISH_MODEL: 'some-model' })).toBeNull()
  })

  it('is enabled only when both the API key and the model are set', () => {
    expect(createAnswerPolisherFromEnv({
      ANTHROPIC_API_KEY: 'sk-test', VIA_POLISH_MODEL: 'some-model',
    })).toBeInstanceOf(AnthropicAnswerPolisher)
  })
})

describe('AnthropicAnswerPolisher', () => {
  it('returns the rewritten text from a successful Messages API response', async () => {
    const fetchImpl = vi.fn(fakeFetch({
      content: [{ type: 'text', text: '  La lluvia acumulada fue de 12.4 mm.  ' }],
    }))
    const polisher = new AnthropicAnswerPolisher('sk-test', 'some-model', fetchImpl as unknown as typeof fetch)

    const result = await polisher.polish({ question: 'rain?', answer: 'Rainfall was 12.4 mm.', evidence: EVIDENCE })

    expect(result).toBe('La lluvia acumulada fue de 12.4 mm.')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('sends the draft and the evidence, and never logs or returns the API key', async () => {
    let capturedInit: RequestInit | undefined
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedInit = init
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), { status: 200 })
    }) as unknown as typeof fetch
    const polisher = new AnthropicAnswerPolisher('sk-secret-value', 'some-model', fetchImpl)

    await polisher.polish({ question: 'rain?', answer: 'Rainfall was 12.4 mm.', evidence: EVIDENCE })

    const body = JSON.parse(capturedInit!.body as string) as { messages: { content: string }[] }
    expect(body.messages[0].content).toContain('Rainfall was 12.4 mm.')
    expect(body.messages[0].content).toContain('Accumulated rainfall: 12.4 mm')
    expect(capturedInit!.headers).toMatchObject({ 'x-api-key': 'sk-secret-value' })
  })

  it('returns null on a non-2xx response instead of throwing', async () => {
    const polisher = new AnthropicAnswerPolisher('sk-test', 'some-model', fakeFetch({ error: 'overloaded' }, 529))
    await expect(polisher.polish({ question: 'q', answer: 'a', evidence: EVIDENCE })).resolves.toBeNull()
  })

  it('returns null on a network error', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    const polisher = new AnthropicAnswerPolisher('sk-test', 'some-model', fetchImpl)
    await expect(polisher.polish({ question: 'q', answer: 'a', evidence: EVIDENCE })).resolves.toBeNull()
  })

  it('returns null when the payload has no text block', async () => {
    const polisher = new AnthropicAnswerPolisher('sk-test', 'some-model', fakeFetch({ content: [] }))
    await expect(polisher.polish({ question: 'q', answer: 'a', evidence: EVIDENCE })).resolves.toBeNull()
  })
})
