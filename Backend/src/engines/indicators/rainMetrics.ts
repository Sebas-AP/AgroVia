export function computeRainMetrics(
  days: { date: string; rainMm: number }[],
  historicalP95Mm: number,
): { rainAccumMm: number; rainyDays: number; extremeRainDays: number; maxDrySpellDays: number } {
  let rainAccumMm = 0
  let rainyDays = 0
  let extremeRainDays = 0
  let maxDrySpellDays = 0
  let currentDrySpell = 0

  for (const day of days) {
    rainAccumMm += day.rainMm
    if (day.rainMm > 0) {
      rainyDays++
    }
    if (day.rainMm > historicalP95Mm) {
      extremeRainDays++
    }
    if (day.rainMm < 1) {
      currentDrySpell++
      maxDrySpellDays = Math.max(maxDrySpellDays, currentDrySpell)
    } else {
      currentDrySpell = 0
    }
  }

  return { rainAccumMm, rainyDays, extremeRainDays, maxDrySpellDays }
}
