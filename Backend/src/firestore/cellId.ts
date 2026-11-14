export type GridProduct = 'power' | 'gpm' | 'smap' | 'modis'

// Grid steps per spec §5.1 resolutions: POWER ~0.5°x0.625°, GPM ~0.1°, SMAP ~9km (~0.08°),
// MODIS ~250m (~0.00225°). Using a single step per axis is a reasonable simplification for
// POWER's slightly different lat/lon steps (0.5 vs 0.625) — we snap both axes to the larger
// of the two (0.625) so two points inside the true rectangular cell never straddle a boundary.
const GRID_STEP_DEGREES: Record<GridProduct, number> = {
  power: 0.625,
  gpm: 0.1,
  smap: 0.08,
  modis: 0.00225,
}

export function computeCellId(lat: number, lon: number, product: GridProduct): string {
  const step = GRID_STEP_DEGREES[product]
  const roundedLat = Math.floor(lat / step) * step
  const roundedLon = Math.floor(lon / step) * step
  return `${product}:${roundedLat.toFixed(5)}:${roundedLon.toFixed(5)}`
}
