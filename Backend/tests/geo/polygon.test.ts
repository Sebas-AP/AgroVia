import { describe, it, expect } from 'vitest'
import {
  isClosedRing, normalizeRing, polygonAreaHa, polygonCentroid, validatePolygon,
} from '../../src/geo/polygon'
import { analyzePlotGeometry, plotPointForLookup } from '../../src/geo/plotGeometry'

const CENTER = { lat: 24.4497, lon: -104.1225 }
// A ~310 m square around the demo plot center (roughly its declared 9.6 ha).
const D_LAT = 0.001393
const D_LON = 0.00153
const OPEN_SQUARE = [
  { lat: CENTER.lat - D_LAT, lon: CENTER.lon - D_LON },
  { lat: CENTER.lat - D_LAT, lon: CENTER.lon + D_LON },
  { lat: CENTER.lat + D_LAT, lon: CENTER.lon + D_LON },
  { lat: CENTER.lat + D_LAT, lon: CENTER.lon - D_LON },
]
const CLOSED_SQUARE = [...OPEN_SQUARE, OPEN_SQUARE[0]]

describe('validatePolygon', () => {
  it('accepts an open ring with at least 3 vertices and returns it normalized', () => {
    const result = validatePolygon(OPEN_SQUARE)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(OPEN_SQUARE)
    }
  })

  it('accepts a GeoJSON-style closed ring and strips the repeated vertex', () => {
    const result = validatePolygon(CLOSED_SQUARE)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(OPEN_SQUARE)
    }
  })

  it('rejects fewer than 3 vertices', () => {
    const result = validatePolygon(OPEN_SQUARE.slice(0, 2))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/at least 3 vertices/)
    }
  })

  it('rejects a closed ring that does not actually contain 3 distinct vertices', () => {
    const degenerate = [OPEN_SQUARE[0], OPEN_SQUARE[1], OPEN_SQUARE[0]]
    const result = validatePolygon(degenerate)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/4 positions|distinct vertices/)
    }
  })

  it('rejects out-of-range coordinates instead of clamping them', () => {
    const invalid = [{ lat: 91, lon: 0 }, OPEN_SQUARE[1], OPEN_SQUARE[2]]
    const result = validatePolygon(invalid)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/vertex 0\.lat/)
    }

    const invalidLon = validatePolygon([{ lat: 24, lon: 181 }, OPEN_SQUARE[1], OPEN_SQUARE[2]])
    expect(invalidLon.ok).toBe(false)
    if (!invalidLon.ok) {
      expect(invalidLon.errors.join(' ')).toMatch(/vertex 0\.lon/)
    }
  })

  it('rejects non-numeric or missing vertices and non-array input', () => {
    expect(validatePolygon('not a polygon').ok).toBe(false)
    const result = validatePolygon([{ lat: '24', lon: -104 }, OPEN_SQUARE[1], OPEN_SQUARE[2]])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/numeric lat and lon/)
    }
  })

  it('rejects collinear vertices, which enclose no area', () => {
    const collinear = [
      { lat: 24.44, lon: -104.13 },
      { lat: 24.45, lon: -104.12 },
      { lat: 24.46, lon: -104.11 },
    ]
    const result = validatePolygon(collinear)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/no area/)
    }
  })

  it('rejects a polygon whose vertices are all the same point', () => {
    const same = [OPEN_SQUARE[0], OPEN_SQUARE[0], OPEN_SQUARE[0]]
    const result = validatePolygon(same)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/distinct vertices/)
    }
  })
})

describe('polygon geometry', () => {
  it('detects and normalizes a closed ring', () => {
    expect(isClosedRing(CLOSED_SQUARE)).toBe(true)
    expect(isClosedRing(OPEN_SQUARE)).toBe(false)
    expect(normalizeRing(CLOSED_SQUARE)).toEqual(OPEN_SQUARE)
  })

  it('computes a ~9.6 ha square surface, same for open and closed input', () => {
    const area = polygonAreaHa(OPEN_SQUARE)
    expect(area).toBeGreaterThan(9)
    expect(area).toBeLessThan(10.2)
    expect(polygonAreaHa(CLOSED_SQUARE)).toBeCloseTo(area, 6)
  })

  it('computes a centroid inside the square, close to its center', () => {
    const centroid = polygonCentroid(OPEN_SQUARE)
    expect(centroid.lat).toBeCloseTo(CENTER.lat, 4)
    expect(centroid.lon).toBeCloseTo(CENTER.lon, 4)
  })
})

describe('analyzePlotGeometry', () => {
  it('returns no gaps and no centroid when the plot has no polygon', () => {
    expect(analyzePlotGeometry({ areaHa: 9.6 })).toEqual({ centroid: null, areaHa: null, infoGaps: [] })
  })

  it('reports a discrepancy beyond the tolerance without changing the declared area', () => {
    const result = analyzePlotGeometry({ areaHa: 20, polygon: OPEN_SQUARE })
    expect(result.areaHa).toBeGreaterThan(9)
    expect(result.centroid).not.toBeNull()
    expect(result.infoGaps.join(' ')).toMatch(/declared area is 20 ha/)
    expect(result.infoGaps.join(' ')).toMatch(/declared area was kept/)
  })

  it('does not flag a polygon that matches the declared area within tolerance', () => {
    expect(analyzePlotGeometry({ areaHa: 9.6, polygon: OPEN_SQUARE }).infoGaps).toEqual([])
  })

  it('flags an invalid stored polygon and falls back to the declared center', () => {
    const result = analyzePlotGeometry({ areaHa: 9.6, polygon: [OPEN_SQUARE[0]] as never })
    expect(result.centroid).toBeNull()
    expect(result.infoGaps.join(' ')).toMatch(/invalid/)
  })
})

describe('plotPointForLookup', () => {
  it('uses the polygon centroid when a valid boundary exists', () => {
    const point = plotPointForLookup({ center: { lat: 24.5, lon: -104.2 }, areaHa: 9.6, polygon: OPEN_SQUARE })
    expect(point.lat).toBeCloseTo(CENTER.lat, 4)
    expect(point.lon).toBeCloseTo(CENTER.lon, 4)
  })

  it('falls back to the declared center when the polygon is absent or invalid', () => {
    const center = { lat: 24.5, lon: -104.2 }
    expect(plotPointForLookup({ center, areaHa: 9.6 })).toEqual(center)
    expect(plotPointForLookup({ center, areaHa: 9.6, polygon: [OPEN_SQUARE[0]] as never })).toEqual(center)
  })
})
