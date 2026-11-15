function averageReported(values: (number | null)[]): number | null {
  const reported = values.filter((value): value is number => value !== null)
  if (reported.length === 0) {
    return null
  }
  return reported.reduce((sum, value) => sum + value, 0) / reported.length
}

// Averages only the days inside each trailing window that actually reported a soil temperature.
// A missing day is skipped, not treated as zero, and never shifts another day into the window.
export function computeSoilTemperatureAverages(
  days: { date: string; soilTempC: number | null }[],
): { avg7d: number | null; avg10d: number | null } {
  return {
    avg7d: averageReported(days.slice(-7).map((d) => d.soilTempC)),
    avg10d: averageReported(days.slice(-10).map((d) => d.soilTempC)),
  }
}
