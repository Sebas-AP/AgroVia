import type { Business } from '../types'

export const num = (n: number, d = 0) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)
export const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
export function businessResult(b: Business) {
  const invest = b.seeds + b.fert + b.water + b.labor + b.machinery + b.transport + b.other
  const production = b.area * b.yieldT
  const income = production * b.price
  const profit = income - invest
  return {
    invest, production, income, profit,
    costPerHa: b.area > 0 ? invest / b.area : 0,
    costPerTon: production > 0 ? invest / production : 0,
    margin: income > 0 ? (profit / income) * 100 : 0,
    breakevenT: b.price > 0 ? invest / b.price : 0,
    breakevenYield: b.price > 0 && b.area > 0 ? invest / b.price / b.area : 0,
  }
}
export interface SaleOption { id: string; name: string; km: number; price: number }
export function saleResult(o: SaleOption, tons: number, ratePerTkm: number, otherPerT: number) {
  const gross = tons * o.price
  const transport = tons * o.km * ratePerTkm
  const others = tons * otherPerT
  return { gross, transport, others, net: gross - transport - others }
}
export function addDays(date: string, days: number) {
  const d = new Date(date || Date.now())
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
export const fmtDate = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

// Recomendación simple basada en reglas, no un pronóstico: útil mientras no hay un servicio
// meteorológico predictivo conectado (ver services/config.ts, INTEGRATIONS.weather).
export function weatherRecommendation(temp: number, humidity: number, rainProb: number): string {
  if (rainProb >= 60) return 'Buena probabilidad de lluvia: puedes posponer el riego de hoy y revisar que tus drenajes estén despejados.'
  if (temp >= 30) return 'Temperaturas altas: riega temprano en la mañana o al atardecer para reducir la evaporación.'
  if (humidity >= 75) return 'Humedad alta: vigila tu cultivo por posible presencia de hongos, sobre todo en zonas con poca ventilación.'
  if (temp <= 10) return 'Temperaturas bajas: si tienes cultivos sensibles al frío, considera protegerlos durante la noche.'
  return 'Condiciones estables: buen momento para labores de mantenimiento y para revisar el estado general de tu parcela.'
}
