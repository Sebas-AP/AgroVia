# AGROVÍA

Herramienta de apoyo a decisiones agrícolas para productores de temporal del altiplano de Durango, México. Construida para el reto **"Adapting Farms with NASA Data"** del NASA Space Apps Challenge 2026.

AGROVÍA toma el historial ambiental de fuentes abiertas de NASA, lo cruza con las características de la parcela, criterios agronómicos documentados y precios oficiales de México, y entrega una comparación de **estrategias de rotación de cultivos**. Cada estrategia explica por qué se sugiere, con qué evidencia, qué beneficios tiene, cuánto podría dejar, qué información falta y qué riesgos debe revisar un agrónomo local.

**No diagnostica, no pronostica el clima y no sustituye al técnico agrícola.** Explica lo que los datos muestran y dice con claridad lo que no sabe.

Zona piloto: Guadalupe Victoria, Durango (24.4497 N, −104.1225 W, ~2,000 msnm).

---

## Estado del proyecto

| Parte | Estado |
|---|---|
| `Backend/` | Funcional con **proveedores de datos simulados**. Sin conexión real a NASA todavía. Sin autenticación en las rutas HTTP. |
| `Modelo/` | Funcional. Modelo entrenado y clientes **reales** de NASA POWER y MODIS. |
| `AppMovil/` | WebView que carga el prototipo de interfaz. **No consume el backend todavía.** |
| Integración | **Pendiente.** Las tres partes aún no se comunican entre sí. |

Esto es un prototipo de hackatón. No lo despliegues en público tal como está: las rutas del backend no verifican identidad.

---

## Arquitectura

```
┌─────────────────────────────────────┐
│  AppMovil (Android, WebView)        │
│  Carga un bundle de interfaz web    │
└──────────────┬──────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────┐
│  Backend (Express + TypeScript)     │
│  · Motor de indicadores             │
│  · Motor de rotaciones (reglas)     │
│  · Motor económico                  │
│  · Persistencia en Firestore        │
└──────┬───────────────────┬──────────┘
       │ Admin SDK         │ HTTP (pendiente)
┌──────▼─────────┐  ┌──────▼──────────────────┐
│   Firestore    │  │  Modelo (FastAPI)       │
│   + Storage    │  │  · NASA POWER           │
└────────────────┘  │  · MODIS NDVI (ORNL)    │
                    │  · Modelo sklearn       │
                    │  · Catálogo INIFAP      │
                    └─────────────────────────┘
```

**Reparto de responsabilidades previsto:** el Modelo es dueño de los datos externos y de la predicción; el Backend es dueño del estado y de la decisión. Hoy ambos tienen su propio camino de datos y la unión está pendiente.

---

## Las tres partes

### `Backend/` — API y motores de decisión

Express sobre TypeScript, con Firestore por Admin SDK. Node 20 o superior.

```
src/
  engines/
    indicators/   Balance hídrico, lluvia, anomalía de humedad,
                  temperatura del suelo, suelo desnudo, grados-día,
                  armonización de resoluciones, imputación
    rotation/     Generación de estrategias, filtros de compatibilidad, puntaje
    economics/    Inversión, margen, punto de equilibrio, escenarios de precio
  providers/      Interfaces de datos, hoy con implementación simulada
  firestore/      Admin SDK, colecciones, cálculo de celda de cuadrícula
  routes/         health, plots, catalog, prices, internal
  seed/           Catálogo de cultivos y parcela de demostración
  types/          Procedencia, estrategia, negocio, documentos de Firestore
  validators/     Validador de procedencia
```

Rutas:

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Estado del servicio |
| `GET` | `/plots/:id/indicators` | Indicadores ambientales del periodo |
| `POST` | `/plots/:id/rotations` | Genera y guarda las estrategias de rotación |
| `GET` | `/plots/:id/rotations` | Las últimas estrategias calculadas |
| `POST` | `/plots/:id/economics` | Recalcula con los costos del agricultor |
| `GET` | `/catalog/crops` | Catálogo de cultivos con sus criterios |
| `GET` | `/prices/:crop` | Precios por cultivo |
| — | `/internal/*` | Ingesta, validación y dataset. Requiere llave de servicio |

Escenarios de precio: `floor` (piso de garantía), `average` (precio medio rural), `optimistic` (mayoreo menos intermediación), `drop` (percentil bajo del histórico).

### `Modelo/` — Datos de NASA y predicción

Python con FastAPI y scikit-learn.

```
agrovia_api/
  clients/nasa_power.py   Cliente de NASA POWER
  clients/ornl_modis.py   Cliente de MODIS NDVI (ORNL DAAC)
  geo.py                  Detección de municipio por coordenada
  catalogs.py             Catálogo de cultivos del INIFAP
  agronomy.py             Evaluación agronómica por reglas
  model_runner.py         Adaptador del pipeline entrenado
  service.py              Composición de la evaluación
  schemas.py              Contratos de entrada y salida
  main.py                 Aplicación FastAPI
datasets/
  cultivos_inifap.json
  municipios_durango.json
  datasets_cierre_agricola_raw_data/   SIAP 2016-2025
modelo_agrovia.joblib     Pipeline entrenado
train_model.py            Entrenamiento
clean_siap.py             Limpieza de los datos del SIAP
fetch_historical_nasa.py  Descarga del histórico de NASA
```

Rutas:

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/health` | Estado y versión |
| `POST` | `/api/v1/evaluar-parcela` | Evalúa un perfil de parcela completo |
| `GET` | `/api/v1/evaluar-parcela/ejemplo` | Evalúa la parcela de ejemplo incluida |

**El modelo:** `Pipeline` de scikit-learn, clasificador binario de éxito de cosecha, con 8 variables de entrada:

```
cultivo_id, modalidad, cve_mun, lluvia_ciclo_mm,
temp_media_c, temp_max_c, temp_min_extrema_c, radiacion_mj_m2
```

La probabilidad se traduce a tres niveles: `alto` (≥ 0.66), `medio` (≥ 0.33) y `bajo`.

Documentación técnica detallada en `Modelo/DOCUMENTACION_TECNICA_MODELO.md`.

### `AppMovil/` — Aplicación Android

`AppMovil/AgroViaAndroid/agrovia-figma-android-/` es un proyecto Gradle con una sola actividad que abre un `WebView` y carga la interfaz desde `app/src/main/assets/www/`.

La interfaz tiene tres módulos y una pantalla de inicio:

- **Mi parcela** — registro, mapa, eventos e historial de temporadas.
- **Inteligencia** — indicadores ambientales, comparación de rotaciones y el asistente VÍA.
- **Mercado** — tendencia de precios, compradores y modelo de negocio con punto de equilibrio.

Permisos que pide: internet, ubicación y micrófono (para la entrada por voz de VÍA).

---

## Cómo correrlo

### Requisitos
- Node.js 20 o superior
- Python 3.12 o superior
- JDK 17 y el SDK de Android
- Un proyecto de Firebase con Firestore
- Una cuenta de NASA Earthdata, gratuita, para los datos de MODIS

### Backend

```bash
cd Backend
npm ci
cp .env.example .env     # completa los valores
npm run seed             # catálogo de cultivos y parcela de demostración
npm test                 # 23 archivos de prueba
npm run lint
npm run build
```

Las reglas e índices de Firestore están en `Backend/firestore.rules` y `Backend/firestore.indexes.json`. Despliégalos con la CLI de Firebase desde la raíz, donde están `firebase.json` y `.firebaserc`.

### Modelo

```bash
cd Modelo
pip install -r requirements.txt
pytest
uvicorn agrovia_api.main:app --reload
```

Prueba rápida de la API, con el servicio arriba:

```bash
curl http://localhost:8000/api/v1/evaluar-parcela/ejemplo
```

Prueba del modelo sin levantar la API:

```bash
python probar_modelo.py
python test_escenarios_modelo.py
```

### AppMovil

```bash
cd AppMovil/AgroViaAndroid/agrovia-figma-android-
./gradlew :app:assembleDebug
```

---

## Datos

### Fuentes de NASA

| Fuente | Variables | Resolución |
|---|---|---|
| **NASA POWER** | `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `GWETPROF`, `TS`, `ALLSKY_SFC_SW_DWN`, `WS2M` | ~0.5° × 0.625°, diaria desde 1981 |
| **SMAP SPL4SMGP** | `sm_surface`, `sm_rootzone`, `sm_rootzone_pctl`, `soil_temp_layer1` | 9 km, cada 3 horas desde 2015 |
| **GPM IMERG** | Precipitación estimada | 0.1° (~10 km), diaria desde 2000 |
| **MODIS MOD13Q1** | NDVI, EVI y banda de calidad | 250 m, cada 16 días |
| **SRTM / NASADEM** | Elevación, de la que se calcula la pendiente | ~30 m, estático |

NASA POWER no requiere cuenta. Las demás usan Earthdata Login. Para extraer series por punto o polígono de MODIS, SMAP, ECOSTRESS y SRTM conviene **AppEEARS**, que devuelve CSV con la banda de calidad en lugar de HDF5 crudo; sus tareas son asíncronas, así que sirve para precargar, no para responder en vivo.

### Fuentes complementarias

- **SoilGrids 250m (ISRIC)** — textura, carbono orgánico, pH, CEC. Global.
- **FAO GAEZ** — aptitud de cultivos y requerimientos agroclimáticos.
- **SIAP** — precio medio rural y rendimiento por cultivo y municipio. Datos de 2016 a 2025 en `Modelo/datasets/`.
- **SNIIM** — precio mayorista diario.
- **Precios de garantía** — piso para pequeño productor, de las reglas de operación del DOF.
- **INIFAP** — criterios agronómicos por cultivo.
- **SMN / CONAGUA, estación 10030** — registros diarios para validar las fuentes satelitales contra observación terrestre.

### Fuentes que NO sirven para este proyecto

Estas cubren únicamente Estados Unidos y no devuelven datos de Durango. Si aparecen en notas antiguas, ignóralas: **PRISM**, **Web Soil Survey / SSURGO / gNATSGO (USDA-NRCS)**, **CoCoRaHS**, **USGS Water Data**, **USDA NASS QuickStats** y, en su mayoría, **USDA Ag Data Commons**.

Nota sobre SMAP: el producto correcto es **`SPL4SMGP`**. **`SPL1A_RO`** es nivel 1A de radar en modo solo recepción, con sigma naught y telemetría cruda: no contiene humedad del suelo.

### Indicadores derivados

Lluvia acumulada a 5, 10, 15 y 30 días · días con lluvia · lluvia extrema sobre el percentil 95 de la celda · rachas secas · balance hídrico · anomalía de humedad del suelo · temperatura del suelo suavizada · días de helada · días de estrés térmico · grados-día acumulados · meses de suelo desnudo · desvío de NDVI contra años previos · pendiente.

---

## Principios de diseño

Estos no son adornos: son el criterio con el que se acepta o se rechaza un cambio.

1. **Nada de datos inventados.** Si una fuente no responde, la respuesta lo dice. No hay promedios silenciosos ni valores por defecto disfrazados de medición.
2. **Procedencia obligatoria.** Todo dato lleva `source`, `product`, `version`, `asOf`, `latencyDays`, `kind` y `origin`. Un dato sin esos campos es un error, no un dato incompleto.
3. **Lo simulado se marca** y se distingue de lo real en la respuesta de la API y en la interfaz.
4. **Explicable.** Cada puntaje se descompone por criterio y peso. Sin caja negra.
5. **El motor de rotaciones es de reglas con umbrales documentados.** El modelo de aprendizaje automático aporta una variable más al puntaje; no decide por sí solo.
6. **Reproducible.** Cada indicador y cada estrategia guarda la versión del motor y del catálogo.
7. **Honesto con los vacíos.** Cada estrategia declara qué información falta y qué riesgos requieren revisión de un agrónomo local.
8. **Apoya, no reemplaza.** La herramienta nunca se presenta como diagnóstico.

---

## Estructura del repositorio

```
AppMovil/          Aplicación Android con WebView
Backend/           API Express y motores de decisión
Modelo/            Modelo de aprendizaje automático y clientes de NASA
assets/            Recursos compartidos
docs/              Documentación
scripts/           Utilidades de lint y pruebas de CI
firebase.json      Configuración de despliegue de Firebase
requirements.txt   Dependencias de Python de la raíz
```

Cada parte tiene su propio `CLAUDE.md` y `AGENTS.md` con las convenciones que le aplican.

### Integración continua

Tres workflows en `.github/workflows/`, cada uno activado por cambios en su carpeta: `backend-ci.yml` (Node, eslint y vitest), `modelo-ci.yml` (Python, ruff y pytest) y `appmovil-ci.yml`.

Hay un gancho de pre-comisión en `.githooks/pre-commit`. Actívalo con:

```bash
git config core.hooksPath .githooks
```

---

## Contribuir

Lee `CONTRIBUTING.md`. En resumen: una rama por tema, comisiones pequeñas, pruebas que acompañen cada cambio de comportamiento, y nunca credenciales en el repositorio.

---

## Limitaciones conocidas

- **Las rutas del backend no verifican identidad.** Usan el Admin SDK, que se salta las reglas de Firestore. No lo expongas en público sin agregar verificación de token.
- **Los proveedores de datos del backend son simulados.** Los datos reales de NASA hoy solo llegan a través del Modelo.
- **La app no consume el backend.** La interfaz sirve datos de demostración.
- **La resolución satelital es mucho mayor que una parcela.** Una celda de SMAP mide 9 km y una de NASA POWER unos 50 km. Los indicadores son contexto regional, no medición de la parcela, y la interfaz debe decirlo.
- **No hay sensores de campo.** El dispositivo con ESP32 se descartó por su baja viabilidad para el agricultor; las variables de suelo provienen del historial satelital.
- **Los datos satelitales tienen latencia.** La corrida *Final* de GPM IMERG tarda meses; para fechas recientes se usa *Late*, que es menos precisa.

---

## Créditos y atribución

Datos de NASA POWER: «These data were obtained from the NASA Langley Research Center POWER Project funded through the NASA Earth Science Directorate Applied Science Program.»

NDVI de MODIS distribuido por el ORNL DAAC. Humedad del suelo de SMAP y precipitación de GPM distribuidas por los DAAC de la NASA. Propiedades de suelo de SoilGrids (ISRIC, CC BY 4.0). Aptitud de cultivos de FAO GAEZ. Estadística agrícola y precios del SIAP y el SNIIM. Criterios agronómicos del INIFAP. Registros climatológicos del SMN/CONAGUA.
