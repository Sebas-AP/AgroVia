export function imputeGaps(
  days: { date: string; value: number | null }[],
  maxGapDays: number,
): { date: string; value: number | null; imputed: boolean }[] {
  const result: { date: string; value: number | null; imputed: boolean }[] = days.map((d) => ({
    ...d,
    imputed: false,
  }))

  let i = 0
  while (i < result.length) {
    if (result[i].value !== null) {
      i++
      continue
    }
    const gapStart = i
    while (i < result.length && result[i].value === null) {
      i++
    }
    const gapEnd = i // first non-null index after the gap (or length)
    const gapLength = gapEnd - gapStart
    const before = gapStart > 0 ? result[gapStart - 1].value : null
    const after = gapEnd < result.length ? result[gapEnd].value : null

    if (gapLength <= maxGapDays && before !== null && after !== null) {
      const step = (after - before) / (gapLength + 1)
      for (let j = 0; j < gapLength; j++) {
        result[gapStart + j] = {
          date: result[gapStart + j].date,
          value: before + step * (j + 1),
          imputed: true,
        }
      }
    }
  }

  return result
}
