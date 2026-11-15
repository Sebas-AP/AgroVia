// Estado de las integraciones. Ninguna está conectada todavía.
// Para conectarlas: implementar el proveedor en un backend propio (las claves API
// nunca deben vivir en el frontend) y cambiar `connected` a true.
export const INTEGRATIONS = {
  nasaPower: { label: 'NASA POWER', connected: false },
  earthdata: { label: 'NASA Earthdata / satelital', connected: false },
  weather: { label: 'Pronóstico meteorológico externo', connected: false },
  maps: { label: 'Servicio cartográfico', connected: false },
  prices: { label: 'Precios agrícolas oficiales', connected: false },
  ai: { label: 'Proveedor de IA', connected: false },
} as const
export const DEMO = 'DEMOSTRACIÓN'
