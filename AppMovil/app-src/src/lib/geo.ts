import type { Pt } from '../types'
// El mapa de demostración abarca 100 unidades = 800 m (8 m por unidad).
export const M_PER_UNIT = 8
export function areaHa(poly: Pt[]) {
  if (poly.length < 3) return 0
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return (Math.abs(s) / 2) * M_PER_UNIT * M_PER_UNIT / 10000
}
export function ptToCoord(c: { lat: number; lon: number }, p: Pt) {
  const lat = c.lat + ((50 - p.y) * M_PER_UNIT) / 111320
  const lon = c.lon + ((p.x - 50) * M_PER_UNIT) / (111320 * Math.cos((c.lat * Math.PI) / 180))
  return { lat, lon }
}
export function centroid(poly: Pt[]): Pt {
  if (!poly.length) return { x: 50, y: 50 }
  return { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length }
}
export const fmtCoord = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'O'}`
export function parseCoords(s: string) {
  const m = s.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = +m[1], lon = +m[2]
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}
