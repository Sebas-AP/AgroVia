export function computeGrowingDegreeDaysAccum(
  days: { date: string; tempAvgC: number }[],
  baseTempC: number,
): number {
  return days.reduce((sum, day) => sum + Math.max(0, day.tempAvgC - baseTempC), 0)
}
