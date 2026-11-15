# Guía para el equipo de frontend

Este documento es para cuando el equipo de frontend reconstruya el bundle de React desde el
proyecto Figma Make original (ver `INTEGRACION.md` §0: el fuente no está en este repo, así que
esta integración no pudo tocar la app). Describe exactamente qué llamar, con qué forma de
respuesta, para reemplazar los datos de demostración en la capa de `services/`.

## 1. URL base y autenticación

- **Backend** (parcelas, rotaciones, economía): la URL del Backend desplegado (Render, mismo
  proveedor que el Modelo — ver sección 4 de `INTEGRACION.md`). En desarrollo contra el emulador
  de Android, usa `http://10.0.2.2:<puerto>` — el `network_security_config.xml` de depuración ya
  permite texto claro solo hacia ese host, solo en builds de debug.
- Toda ruta `/plots/:id/*` del Backend requiere un header `Authorization: Bearer <idToken>` con
  un ID token de Firebase Auth real (anónimo, por decisión del equipo — ver `INTEGRACION.md`
  §4). Sin token: `401`. Con un token de otro usuario que no es dueño de la parcela: `403`.
  `/catalog/crops` y `/prices/:crop` no requieren token.
- El Modelo (clima/NDVI/predicción/municipio/cultivos) normalmente lo llama el Backend, no la
  app directamente — pero sus rutas no requieren autenticación si alguna pantalla necesita
  llamarlo de forma directa.

## 2. Rutas del Backend que la app debe consumir

| Ruta | Para qué sirve | Reemplaza en `services/` |
|---|---|---|
| `GET /plots/:id/indicators` | Indicadores actuales (clima, humedad, NDVI del último mes) | el mock de "indicadores de parcela" |
| `POST /plots/:id/rotations` | Genera y guarda estrategias de rotación | el mock de "generar estrategias" |
| `GET /plots/:id/rotations` | Últimas estrategias ya generadas | el mock de "listar estrategias" |
| `POST /plots/:id/economics` | Recalcula economía con los costos reales del productor | el mock de "calculadora de economía" |
| `GET /catalog/crops` | Catálogo de cultivos con su fuente/documentación | el mock de "catálogo de cultivos" |
| `GET /prices/:crop` | Snapshot de precio simulado/real para un cultivo | el mock de "precio de mercado" |

Todas las respuestas de error usan la misma forma: `{ "error": { "code": "...", "message": "...", "detail": ... } }`.

## 3. La forma de `RotationStrategy` (lo que devuelve `/plots/:id/rotations`)

```ts
{
  id: string
  type: "current" | "alternative"
  sequence: { year: number; crop: string }[]
  rationale: string
  evidence: { label: string; value: string; unit: string; period: string; provenance: Provenance }[]
  benefits: string[]
  economics: { scenario: "floor"|"average"|"optimistic"|"drop"; priceTon: number; result: EconomicResult }[]
  infoGaps: string[]        // muéstralos en la UI — son huecos de información reales, no ruido
  risks: string[]
  scores: { water, soil, climateRisk, pests, economy, market, modelSuccess? }  // 0-100 cada uno; modelSuccess puede faltar
  totalScore: number
  summary: { sequenceText: string; shortRationale: string; avgMarginPct: number | null; avgProfitMxn: number | null }
  engineVersion: string
  catalogVersion: string
  generatedAt: string
}
```

**Importante para la tarjeta de resumen (3 datos):** el campo se llama `avgMarginPct` (porcentaje)
y `avgProfitMxn` (dinero) — no `avgMargin`. Si la pantalla actual muestra un solo número con signo
de pesos, usa `avgProfitMxn`; si muestra un porcentaje, usa `avgMarginPct`. Ambos pueden ser
`null` cuando el escenario promedio no tiene margen definible — muéstralo como "no disponible",
nunca como 0.

`scores.modelSuccess` solo aparece cuando el Modelo respondió al menos para un cultivo de la
secuencia (`USE_SIMULATED_PROVIDERS=false` en el Backend y el Modelo accesible). Trátalo como
opcional en el tipo del lado de la app.

`Provenance` siempre trae `source, product, version, asOf, latencyDays, kind, origin`.
`origin: "simulated"` significa que ese dato concreto todavía no viene de una fuente real — la
UI ya debería distinguir esto visualmente si el prototipo de Figma lo contemplaba.

## 4. Banderas de integración (`INTEGRATIONS.connected`)

El bundle actual tiene banderas `connected: false` en su código. Cuando se reconstruya desde el
fuente, cada bandera debe pasar a `true` solo cuando esa fuente concreta ya está conectada de
verdad:

- Parcelas/rotaciones/economía → `true` en cuanto la app hable con el Backend real (no antes).
- Clima/NDVI reales → el Backend los expone igual (vía `evidence[].provenance.origin`), pero hoy
  solo NDVI puede venir de datos reales (`USE_SIMULATED_PROVIDERS=false`); clima sigue simulado —
  ver `INTEGRACION.md` para el porqué. No marques clima como `connected: true` todavía.

## 5. Qué NO hacer

- No llames a `Modelo/api/v1/evaluar-parcela` una vez por cada cultivo candidato — descarga NASA/
  ORNL completo cada vez. Eso ya lo resuelve el Backend internamente (`/plots/:id/rotations`).
- No construyas tu propia lógica de reintentos/caché contra el Modelo desde la app — ya existe
  en el Backend y en el Modelo mismo.
