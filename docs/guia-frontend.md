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
| `POST /plots/:id/via/ask` | Asistente VÍA: responde una pregunta sobre esa parcela con plantillas y evidencia | el mock del "chat"/asistente |
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

## 4. El asistente VÍA (`POST /plots/:id/via/ask`)

Pregunta en lenguaje natural, respuesta **por plantilla**, nunca texto libre generado. Es una
ruta por parcela (`/plots/:id/via/ask`), así que usa el mismo `Authorization` que el resto: sin
token `401`, con token de otro uid `403`, parcela inexistente `404`.

```json
// request
{ "question": "¿Cuánta lluvia cayó este mes?" }

// response
{
  "intent": "water",
  "answer": "Recorded rainfall over the analysed window totals 12.4 mm across 3 rainy days, ...",
  "evidence": [
    { "label": "Accumulated rainfall", "value": "12.4", "unit": "mm",
      "period": "2026-11-01", "provenance": { "source": "...", "origin": "simulated", "...": "..." } }
  ],
  "infoGaps": ["..."]
}
```

- `intent` es una de: `water`, `soilMoisture`, `temperature`, `ndvi`, `strategies`, `economics`,
  `market`, `plot`, `unknown`.
- **Toda cifra de `answer` aparece también en `evidence`** (mismo valor formateado). El Backend
  rechaza internamente cualquier respuesta que no cumpla esto; la UI puede confiar en ello, y
  puede usar `evidence[]` para mostrar la fuente de cada número.
- `evidence` vacío significa que no había datos para esa pregunta: la respuesta lo dice con
  palabras y `infoGaps` explica qué falta. No es un error HTTP.
- `intent: "unknown"` es una respuesta honesta, no un fallo: la pregunta no coincide con ninguna
  intención soportada y no se devuelven cifras. Úsalo para ofrecer botones de ejemplo.
- La respuesta es determinista para la misma parcela y pregunta: no hay modelo de lenguaje en el
  camino por defecto (`ANTHROPIC_API_KEY` y `VIA_POLISH_MODEL` sin configurar). Si en el futuro
  se configura la redacción opcional, el Backend solo acepta el texto reescrito cuando sus cifras
  ya están en `evidence`; si no, devuelve la plantilla y agrega un `infoGap`.
- `question` vacía, no-string o de más de 500 caracteres → `400`.

## 5. Banderas de integración (`INTEGRATIONS.connected`)

El bundle actual tiene banderas `connected: false` en su código. Cuando se reconstruya desde el
fuente, cada bandera debe pasar a `true` solo cuando esa fuente concreta ya está conectada de
verdad:

- Parcelas/rotaciones/economía → `true` en cuanto la app hable con el Backend real (no antes).
- Clima/NDVI reales → el Backend ya puede usar ambos desde el Modelo
  (`USE_SIMULATED_PROVIDERS=false` + `MODELO_BASE_URL`, ver `INTEGRACION_FASE2.md`): clima desde
  `POST /api/v1/clima/diario` y NDVI desde `POST /api/v1/ndvi`. Aun así, cada figura trae su
  `provenance.origin`; la UI debe seguir mostrando "simulado" cuando diga `simulated`, porque con
  la bandera por defecto (`true`) los proveedores siguen siendo simulados.
- Humedad de suelo, perfil estático de suelo, criterios de cultivo y precios siguen simulados
  siempre — no los marques como conectados.

## 6. Polígono de parcela (opcional)

Una parcela puede traer un `polygon` (arreglo de `{ lat, lon }`, abierto o cerrado estilo
GeoJSON) en su documento de Firestore. No es una ruta nueva: lo escribe el alta de parcela.

- Con un polígono válido, el Backend usa su **centroide** para las consultas al Modelo, no el
  `center` declarado (que puede estar fuera del terreno).
- La superficie del polígono se calcula y se **compara** con `areaHa`; si difiere más de 10 %, se
  agrega un `infoGap` a las estrategias. `areaHa` nunca se sobrescribe.
- Un polígono inválido (menos de 3 vértices distintos, coordenadas fuera de rango, sin área) se
  reporta como `infoGap` y se sigue usando `center`.
- Para dibujarlo en un mapa, el polígono puede venir cerrado: normalízalo antes de pintarlo.

## 7. Qué NO hacer

- No llames a `Modelo/api/v1/evaluar-parcela` una vez por cada cultivo candidato — descarga NASA/
  ORNL completo cada vez. Eso ya lo resuelve el Backend internamente (`/plots/:id/rotations`).
- No construyas tu propia lógica de reintentos/caché contra el Modelo desde la app — ya existe
  en el Backend y en el Modelo mismo.
