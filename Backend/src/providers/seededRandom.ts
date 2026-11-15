// Deterministic PRNG keyed on a string seed, so the same cellId/cropId always
// produces the same simulated values across runs (reproducibility — spec §4.5).
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

export function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (current.getTime() <= end.getTime()) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}
