function average(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function computeSoilTemperatureAverages(
  days: { date: string; soilTempC: number }[],
): { avg7d: number | null; avg10d: number | null } {
  return {
    avg7d: average(days.slice(-7).map((d) => d.soilTempC)),
    avg10d: average(days.slice(-10).map((d) => d.soilTempC)),
  }
}
