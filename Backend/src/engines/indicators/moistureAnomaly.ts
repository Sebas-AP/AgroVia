export function computeMoistureAnomaly(
  days: { date: string; smRootzonePctl: number | null }[],
): number | null {
  const values = days.map((d) => d.smRootzonePctl).filter((v): v is number => v !== null)
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length
}
