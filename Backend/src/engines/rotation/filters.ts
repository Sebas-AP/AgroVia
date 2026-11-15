import type { PlotSnapshot, CropCatalogEntry } from '../../types/firestoreDocs'

// Compatibility filters per spec §9. Only the water-availability check is applied: the catalog
// schema (Task 4) carries no equipment-requirement or planting-window-vs-current-date fields to
// filter on, so those two spec-named filters are left out rather than fabricated against data
// that doesn't exist (honest gap, flagged for the real-workers follow-up plan).
export function filterCompatibleCrops(plot: PlotSnapshot, catalog: CropCatalogEntry[]): CropCatalogEntry[] {
  return catalog.filter((crop) => {
    if (plot.constraints.waterAvailability === 'low' && crop.droughtTolerance === 'low') {
      return false
    }
    return true
  })
}
