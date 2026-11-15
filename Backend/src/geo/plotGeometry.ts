import type { PlotSnapshot } from '../types/firestoreDocs'
import { polygonAreaHa, polygonCentroid, validatePolygon, type LatLon } from './polygon'

// A stored polygon is compared against the farmer-declared area but never overwrites it: the
// declared figure is what the farmer reported, and a map outline digitized by hand (or a demo
// placeholder) is not automatically more trustworthy. Anything beyond this tolerance is
// surfaced as an infoGap for a human to review.
const AREA_DISCREPANCY_TOLERANCE_PCT = 10

export interface PlotGeometryInfo {
  // Null when the plot has no polygon, or when its stored polygon failed validation.
  centroid: LatLon | null
  areaHa: number | null
  infoGaps: string[]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function analyzePlotGeometry(
  plot: Pick<PlotSnapshot, 'areaHa' | 'polygon'>,
): PlotGeometryInfo {
  if (plot.polygon === undefined) {
    return { centroid: null, areaHa: null, infoGaps: [] }
  }

  const validation = validatePolygon(plot.polygon)
  if (!validation.ok) {
    return {
      centroid: null,
      areaHa: null,
      infoGaps: [
        `Stored plot polygon is invalid (${validation.errors.join('; ')}) — the declared center `
        + 'and area were used instead.',
      ],
    }
  }

  const ring = validation.value
  const areaHa = polygonAreaHa(ring)
  const centroid = polygonCentroid(ring)
  const infoGaps: string[] = []

  if (plot.areaHa > 0) {
    const discrepancyPct = (Math.abs(areaHa - plot.areaHa) / plot.areaHa) * 100
    if (discrepancyPct > AREA_DISCREPANCY_TOLERANCE_PCT) {
      infoGaps.push(
        `Stored polygon surface is ${round2(areaHa)} ha but the declared area is `
        + `${round2(plot.areaHa)} ha (${round2(discrepancyPct)}% difference) — the declared area `
        + 'was kept; review the plot boundary.',
      )
    }
  }

  return { centroid, areaHa, infoGaps }
}

// The point to use when a provider or the Modelo mapper needs a single coordinate: the actual
// polygon centroid when a valid boundary exists, otherwise the declared center. Never replaces
// the stored center itself.
export function plotPointForLookup(
  plot: Pick<PlotSnapshot, 'center' | 'polygon' | 'areaHa'>,
): LatLon {
  const geometry = analyzePlotGeometry(plot)
  return geometry.centroid ?? { lat: plot.center.lat, lon: plot.center.lon }
}
