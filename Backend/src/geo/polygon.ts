// Plot-boundary geometry: validation, surface area and centroid for an optional polygon stored
// on a plot. The polygon is a plain list of { lat, lon } vertices, either explicitly closed
// (last vertex repeats the first, GeoJSON style) or implicitly closed. Nothing here invents a
// coordinate: an invalid polygon is reported as invalid and callers fall back to the declared
// center/area instead of guessing.

export interface LatLon {
  lat: number
  lon: number
}

export type PolygonValidation =
  | { ok: true; value: LatLon[] }
  | { ok: false; errors: string[] }

// Mean Earth radius (IUGG) in metres.
const EARTH_RADIUS_M = 6371008.8
const SQUARE_METRES_PER_HECTARE = 10_000
// Coordinates closer than this are treated as the same vertex when detecting closure.
const CLOSE_EPSILON = 1e-9
// Below this, a ring is treated as degenerate (collinear/zero-area) rather than a real boundary.
// 1 m^2 comfortably clears the floating-point noise floor of the projection below (~2e-3 m^2 for
// an exactly collinear ring, measured directly) while staying far under any real plot's area.
const DEGENERATE_AREA_SQUARE_METRES = 1

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= CLOSE_EPSILON
}

export function isClosedRing(vertices: LatLon[]): boolean {
  if (vertices.length < 2) {
    return false
  }
  const first = vertices[0]
  const last = vertices[vertices.length - 1]
  return nearlyEqual(first.lat, last.lat) && nearlyEqual(first.lon, last.lon)
}

// Drops the repeated closing vertex so area/centroid loops don't count a zero-length edge.
export function normalizeRing(vertices: LatLon[]): LatLon[] {
  return isClosedRing(vertices) ? vertices.slice(0, -1) : [...vertices]
}

function isLatLon(value: unknown): value is LatLon {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return typeof candidate.lat === 'number' && typeof candidate.lon === 'number'
}

export function validatePolygon(value: unknown): PolygonValidation {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['polygon must be an array of { lat, lon } vertices'] }
  }

  const errors: string[] = []
  const vertices: LatLon[] = []
  value.forEach((raw, index) => {
    if (!isLatLon(raw)) {
      errors.push(`vertex ${index} must be an object with numeric lat and lon`)
      return
    }
    if (!Number.isFinite(raw.lat) || raw.lat < -90 || raw.lat > 90) {
      errors.push(`vertex ${index}.lat must be a finite number between -90 and 90`)
    }
    if (!Number.isFinite(raw.lon) || raw.lon < -180 || raw.lon > 180) {
      errors.push(`vertex ${index}.lon must be a finite number between -180 and 180`)
    }
    vertices.push({ lat: raw.lat, lon: raw.lon })
  })

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const closed = isClosedRing(vertices)
  const ring = normalizeRing(vertices)
  const positionCount = value.length

  if (closed && positionCount < 4) {
    errors.push('a closed polygon needs at least 4 positions (3 distinct vertices plus the repeated first vertex)')
  } else if (!closed && ring.length < 3) {
    errors.push('polygon must have at least 3 vertices')
  }

  const distinct = new Set(ring.map((vertex) => `${vertex.lat}:${vertex.lon}`))
  if (distinct.size < 3) {
    errors.push('polygon must have at least 3 distinct vertices')
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  if (planarAreaSquareMetres(ring) < DEGENERATE_AREA_SQUARE_METRES) {
    return { ok: false, errors: ['polygon encloses no area (its vertices are collinear)'] }
  }
  return { ok: true, value: ring }
}

// Shoelace area on an equirectangular projection around the mean latitude, in actual square
// metres (degrees converted to radians and scaled by Earth's radius before the shoelace sum —
// without that conversion this returned square *degrees*, off from real square metres by a
// factor of roughly (EARTH_RADIUS_M * pi/180)^2 ~= 1.2e10, which silently made the "degenerate"
// threshold below reject any real plot smaller than roughly a hectare). Used only to reject a
// truly degenerate ring: on a sphere, vertices that are exactly collinear in lat/lon can still
// enclose a thin sliver under the geodesic formula below.
function planarAreaSquareMetres(ring: LatLon[]): number {
  const meanLat = ring.reduce((sum, vertex) => sum + vertex.lat, 0) / ring.length
  const longitudeScale = Math.cos(toRadians(meanLat))
  const projected = ring.map((vertex) => ({
    x: toRadians(vertex.lon) * longitudeScale * EARTH_RADIUS_M,
    y: toRadians(vertex.lat) * EARTH_RADIUS_M,
  }))
  let twiceArea = 0
  for (let i = 0; i < projected.length; i++) {
    const current = projected[i]
    const next = projected[(i + 1) % projected.length]
    twiceArea += current.x * next.y - next.x * current.y
  }
  return Math.abs(twiceArea / 2)
}

// Geodesic surface area of a spherical polygon (Chamberlain & Duquette), in hectares. Valid for
// the small, non-polar, non-antimeridian-crossing plots this API handles.
export function polygonAreaHa(polygon: LatLon[]): number {
  const ring = normalizeRing(polygon)
  if (ring.length < 3) {
    return 0
  }

  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]
    sum += toRadians(next.lon - current.lon)
      * (2 + Math.sin(toRadians(current.lat)) + Math.sin(toRadians(next.lat)))
  }

  const squareMetres = Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
  return squareMetres / SQUARE_METRES_PER_HECTARE
}

// Area-weighted centroid (shoelace on an equirectangular projection around the mean latitude).
// Falls back to the arithmetic mean when the projected area is degenerate; validatePolygon
// already rejects truly degenerate rings, so that fallback only covers near-zero rounding.
export function polygonCentroid(polygon: LatLon[]): LatLon {
  const ring = normalizeRing(polygon)
  const meanLat = ring.reduce((sum, vertex) => sum + vertex.lat, 0) / ring.length
  const longitudeScale = Math.cos(toRadians(meanLat))

  let twiceArea = 0
  let weightedX = 0
  let weightedY = 0
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i]
    const next = ring[(i + 1) % ring.length]
    const currentX = current.lon * (longitudeScale || 1)
    const nextX = next.lon * (longitudeScale || 1)
    const cross = currentX * next.lat - nextX * current.lat
    twiceArea += cross
    weightedX += (currentX + nextX) * cross
    weightedY += (current.lat + next.lat) * cross
  }

  if (Math.abs(twiceArea) <= CLOSE_EPSILON) {
    const meanLon = ring.reduce((sum, vertex) => sum + vertex.lon, 0) / ring.length
    return { lat: meanLat, lon: meanLon }
  }

  const scale = 3 * twiceArea
  return {
    lat: weightedY / scale,
    lon: weightedX / scale / (longitudeScale || 1),
  }
}
