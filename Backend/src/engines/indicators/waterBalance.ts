export function computeWaterBalance(
  days: { date: string; rainMm: number; evapotranspirationMm: number }[],
  windowDays: 5 | 10 | 15 | 30,
): number | null {
  if (days.length === 0) {
    return null
  }
  const window = days.slice(-windowDays)
  return window.reduce((sum, day) => sum + (day.rainMm - day.evapotranspirationMm), 0)
}
