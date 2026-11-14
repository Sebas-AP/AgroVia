export type GridProduct = 'power' | 'gpm' | 'smap' | 'modis'

// Grid steps per spec §5.1 resolutions: POWER 0.5° latitude x 0.625° longitude (its two axes
// really do differ — snapping both to one value would place points from the same true POWER
// cell into different ids, defeating the per-cell caching this function exists for), GPM ~0.1°,
// SMAP ~9km (~0.08°), MODIS ~250m (~0.00225°).
const GRID_STEP_DEGREES: Record<GridProduct, { lat: number; lon: number }> = {
  power: { lat: 0.5, lon: 0.625 },
  gpm: { lat: 0.1, lon: 0.1 },
  smap: { lat: 0.08, lon: 0.08 },
  modis: { lat: 0.00225, lon: 0.00225 },
}

// A tiny epsilon before flooring guards against a coordinate that lands exactly on a grid
// boundary (e.g. 0.3 / 0.1) being pushed into the wrong cell by binary floating-point error.
const BOUNDARY_EPSILON = 1e-9

function snapToGrid(value: number, step: number): number {
  return Math.floor(value / step + BOUNDARY_EPSILON) * step
}

export function computeCellId(lat: number, lon: number, product: GridProduct): string {
  const step = GRID_STEP_DEGREES[product]
  const roundedLat = snapToGrid(lat, step.lat)
  const roundedLon = snapToGrid(lon, step.lon)
  return `${product}:${roundedLat.toFixed(5)}:${roundedLon.toFixed(5)}`
}
