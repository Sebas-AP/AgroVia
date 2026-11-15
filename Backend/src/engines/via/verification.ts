import type { Evidence } from '../../types/provenance'

// Every figure in a VÍA answer must be traceable to an Evidence entry. Templates build their
// sentences from the same formatted values they push into evidence, and this verifier is the
// last line of defense: it extracts every number from the final text and rejects any that no
// evidence value backs. It also validates optional AI rewrites before they are returned.

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g

function numbersIn(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? []
}

function canonical(raw: string): number {
  return Number(Number(raw).toFixed(6))
}

export function findUnsupportedNumbers(answer: string, evidence: Evidence[]): string[] {
  const supported = new Set<number>()
  for (const item of evidence) {
    for (const token of numbersIn(item.value)) {
      supported.add(canonical(token))
    }
  }

  const unsupported: string[] = []
  for (const token of numbersIn(answer)) {
    if (!supported.has(canonical(token))) {
      unsupported.push(token)
    }
  }
  return unsupported
}

export function assertGrounded(answer: string, evidence: Evidence[]): void {
  const unsupported = findUnsupportedNumbers(answer, evidence)
  if (unsupported.length > 0) {
    throw new Error(`VÍA answer contains figures with no supporting evidence: ${unsupported.join(', ')}`)
  }
}
