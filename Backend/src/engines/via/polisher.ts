import type { Evidence } from '../../types/provenance'

// Optional AI rewriting for a VÍA answer. The template answer is always the source of truth: the
// polisher may only rephrase it, and any rewrite whose figures are not already backed by the
// evidence is discarded by the caller (routes/plots.ts). Disabled unless BOTH ANTHROPIC_API_KEY
// and VIA_POLISH_MODEL are set — there is no fallback model id invented here, and no SDK is
// added to package.json: this is a plain fetch call to the Messages API.

export interface PolishInput {
  question: string
  answer: string
  evidence: Evidence[]
  // Retrieved real-dataset context (engines/via/retrieval.ts) — grounding material the model may
  // draw on in prose, but it is still never allowed to introduce a number absent from evidence.
  retrievedContext?: string
}

export interface AnswerPolisher {
  polish(input: PolishInput): Promise<string | null>
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const POLISH_TIMEOUT_MS = 8000

const SYSTEM_PROMPT = [
  'You rewrite an answer produced by a farm-advisory assistant.',
  'Do not add, remove, change, or reorder any number, unit, date, or factual claim.',
  'Every figure in the draft is backed by the evidence list; do not introduce new figures.',
  'You may use the reference data section to add qualitative agronomic context in prose, but',
  'never invent a number — any number must still come from the evidence list.',
  'Keep the same language as the draft.',
  'Return only the rewritten answer, with no preamble and no markdown.',
].join(' ')

function userContent(input: PolishInput): string {
  const evidenceText = input.evidence
    .map((item) => `- ${item.label}: ${item.value} ${item.unit} (${item.provenance.source}, origin=${item.provenance.origin})`)
    .join('\n')
  const referenceBlock = input.retrievedContext
    ? `\n\nReference data (real crop catalog, for qualitative context only):\n${input.retrievedContext}`
    : ''
  return `Question: ${input.question}\n\nDraft answer:\n${input.answer}\n\nEvidence:\n${evidenceText}${referenceBlock}`
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
}

export class AnthropicAnswerPolisher implements AnswerPolisher {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async polish(input: PolishInput): Promise<string | null> {
    try {
      const response = await this.fetchImpl(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 700,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent(input) }],
        }),
        signal: AbortSignal.timeout(POLISH_TIMEOUT_MS),
      })
      if (!response.ok) {
        return null
      }
      const payload = await response.json() as AnthropicResponse
      const text = payload.content?.find((block) => block.type === 'text')?.text?.trim()
      return text ? text : null
    } catch {
      // A polish is best-effort: timeouts, network errors and malformed payloads all fall back
      // to the verified template answer.
      return null
    }
  }
}

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const NVIDIA_DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct'

interface NvidiaResponse {
  choices?: { message?: { content?: string } }[]
}

// NVIDIA NIM is OpenAI-compatible (chat/completions), unlike Anthropic's Messages API, so this
// is a separate client rather than a flag on AnthropicAnswerPolisher.
export class NvidiaAnswerPolisher implements AnswerPolisher {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = NVIDIA_DEFAULT_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async polish(input: PolishInput): Promise<string | null> {
    try {
      const response = await this.fetchImpl(NVIDIA_CHAT_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 700,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent(input) },
          ],
        }),
        signal: AbortSignal.timeout(POLISH_TIMEOUT_MS),
      })
      if (!response.ok) {
        return null
      }
      const payload = await response.json() as NvidiaResponse
      const text = payload.choices?.[0]?.message?.content?.trim()
      return text ? text : null
    } catch {
      return null
    }
  }
}

export function createAnswerPolisherFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): AnswerPolisher | null {
  // NVIDIA wins when configured — it's the provider in active use for VÍA's RAG-grounded
  // rewriting (engines/via/retrieval.ts). Anthropic stays available as a fallback provider.
  if (env.NVIDIA_API_KEY) {
    return new NvidiaAnswerPolisher(env.NVIDIA_API_KEY, env.NVIDIA_POLISH_MODEL || NVIDIA_DEFAULT_MODEL, fetchImpl)
  }
  const apiKey = env.ANTHROPIC_API_KEY
  const model = env.VIA_POLISH_MODEL
  if (!apiKey || !model) {
    return null
  }
  return new AnthropicAnswerPolisher(apiKey, model, fetchImpl)
}
