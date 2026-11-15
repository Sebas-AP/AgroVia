import type { Parcel } from '../types'
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const CLIMATE_BASE = {
  ndvi: [0.24, 0.21, 0.19, 0.2, 0.26, 0.41, 0.58, 0.69, 0.73, 0.62, 0.43, 0.3],
  precip: [12, 8, 10, 22, 48, 160, 210, 195, 170, 85, 25, 14],
  temp: [15, 16, 19, 22, 24, 23, 21, 21, 21, 19, 17, 15],
  solar: [4.8, 5.6, 6.4, 7.0, 7.2, 6.4, 5.9, 5.9, 5.5, 5.2, 4.8, 4.5],
  et: [2.2, 2.8, 3.6, 4.5, 5.1, 4.4, 3.8, 3.8, 3.5, 3.0, 2.4, 2.0],
  hum: [48, 42, 36, 34, 42, 64, 74, 76, 75, 66, 56, 52],
}
export function rolling(key: keyof typeof CLIMATE_BASE) {
  const now = new Date().getMonth()
  return Array.from({ length: 12 }, (_, i) => {
    const m = (now - 11 + i + 24) % 12
    return { label: MONTHS[m], value: CLIMATE_BASE[key][m] }
  })
}
export const CROPS: Record<string, { yieldT: number; price: number; cycle: number }> = {
  Maíz: { yieldT: 5, price: 6200, cycle: 150 },
  Frijol: { yieldT: 1.2, price: 17500, cycle: 100 },
  Sorgo: { yieldT: 4.5, price: 5100, cycle: 125 },
  Trigo: { yieldT: 5, price: 5600, cycle: 140 },
  Cebada: { yieldT: 4, price: 5300, cycle: 120 },
}
export const PRICE_TREND: Record<string, number[]> = {
  Maíz: [5900, 5950, 6000, 6050, 6020, 6080, 6100, 6150, 6120, 6170, 6070, 6200],
  Frijol: [17900, 17850, 17900, 17700, 17800, 17650, 17700, 17600, 17750, 17640, 17750, 17500],
  Sorgo: [4950, 4980, 5000, 5020, 5060, 5040, 5080, 5070, 5100, 5060, 5060, 5100],
  Trigo: [5500, 5520, 5540, 5530, 5550, 5560, 5580, 5570, 5590, 5600, 5585, 5600],
  Cebada: [5350, 5340, 5320, 5330, 5310, 5320, 5300, 5290, 5310, 5300, 5330, 5300],
}
export const BUYERS = [
  { id: 'b1', name: 'Acopio Ejemplo Norte', type: 'Centro de acopio', place: 'Localidad ficticia A', km: 18, crop: 'Maíz', price: 6350, req: 'Humedad máxima 14 %, grano limpio.', contact: 'Tel. 000 000 0001 (ficticio)', angle: 40 },
  { id: 'b2', name: 'Cooperativa Campo Unido', type: 'Cooperativa', place: 'Localidad ficticia B', km: 42, crop: 'Maíz', price: 6500, req: 'Ser socio. Entrega en bodega de la cooperativa.', contact: 'Tel. 000 000 0002 (ficticio)', angle: 150 },
  { id: 'b3', name: 'Comercializadora Demo Sur', type: 'Comercializador', place: 'Localidad ficticia C', km: 95, crop: 'Maíz', price: 6900, req: 'Mínimo 30 toneladas. Contrato por escrito.', contact: 'correo@ejemplo.invalid (ficticio)', angle: 235 },
  { id: 'b4', name: 'Comprador Ejemplo Sorgo', type: 'Comercializador', place: 'Localidad ficticia D', km: 27, crop: 'Sorgo', price: 5300, req: 'Grano seco y sin impurezas.', contact: 'Tel. 000 000 0004 (ficticio)', angle: 300 },
  { id: 'b5', name: 'Acopio Demo Frijol', type: 'Centro de acopio', place: 'Localidad ficticia E', km: 55, crop: 'Frijol', price: 18400, req: 'Clasificación por variedad.', contact: 'Tel. 000 000 0005 (ficticio)', angle: 95 },
  { id: 'b6', name: 'Cooperativa Trigo Demo', type: 'Cooperativa', place: 'Localidad ficticia F', km: 63, crop: 'Trigo', price: 5750, req: 'Entrega con análisis de humedad.', contact: 'Tel. 000 000 0006 (ficticio)', angle: 200 },
]
export const DEMO_PARCEL: Parcel = {
  id: 'demo', demo: true, name: 'Parcela El Mirador (demostración)', areaHa: '9.6', terrain: 'Plano', soil: 'Franco',
  water: 'Limitada', irrigation: 'Temporal (lluvia)', crop: 'Maíz', sowingDate: new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10),
  stage: 'Crecimiento', center: { lat: 20.5, lon: -103.5 },
  polygon: [{ x: 30, y: 30 }, { x: 68, y: 26 }, { x: 72, y: 62 }, { x: 34, y: 68 }],
  country: 'México', state: 'Jalisco', municipality: 'Municipio de demostración', locality: 'Localidad de demostración', altitude: '1,450',
  events: [
    { id: 'e1', date: new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10), type: 'Siembra', note: 'Siembra de maíz (evento de demostración).' },
    { id: 'e2', date: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), type: 'Fertilización', note: 'Primera aplicación (evento de demostración).' },
  ],
  seasons: [
    { id: 's1', year: String(new Date().getFullYear() - 1), crop: 'Maíz', yieldT: '4.6', demo: true },
    { id: 's2', year: String(new Date().getFullYear() - 2), crop: 'Frijol', yieldT: '1.1', demo: true },
  ],
}
