// Resamples daily/sub-daily records to monthly buckets. The data sources behind the indicators
// engine have different native resolutions (POWER daily, GPM daily, SMAP every 3h, MODIS every
// 16 days — spec §5.1); this is the one explicit harmonization step the spec requires (§8),
// grouping everything by the YYYY-MM prefix of its date before any cross-source aggregation.
export function resampleToMonthly<T extends { date: string }>(
  daily: T[],
  aggregate: (rows: T[]) => Omit<T, 'date'>,
): { month: string; data: Omit<T, 'date'> }[] {
  const groups = new Map<string, T[]>()
  for (const row of daily) {
    const month = row.date.slice(0, 7)
    const group = groups.get(month) ?? []
    group.push(row)
    groups.set(month, group)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => ({ month, data: aggregate(rows) }))
}
