# AGROVÍA
An agricultural decision-support tool for rainfed farmers in the highlands of Durango, Mexico, built for the "Adapting Farms with NASA Data" challenge at the 2026 NASA Space Apps Challenge.

AGROVÍA takes historical environmental data from open NASA sources and cross-references it with plot-specific characteristics, documented agronomic criteria, and official Mexican crop prices to deliver a side-by-side comparison of crop rotation strategies. Each strategy breaks down the rationale behind the recommendation, the supporting evidence, potential benefits, estimated returns, data gaps, and key risks for a local agronomist to review.

**It does not diagnose crop issues, forecast the weather, or replace an agricultural extension agent. Instead, it explains what the data shows—and clearly states what it doesn't know.

Zona piloto: Guadalupe Victoria, Durango (24.4497 N, −104.1225 W, ~2,000 msnm).

---

## Project status

| Part | Status |
|---|---|
| `Backend/` | Functional. Routes `/plots/:id/*` protected with Firebase ID tokens (`plotOwnerAuth`); `/internal/*` using a service account key. Providers **mocked by default**; weather, soil moisture, NDVI, and crop prices can be pulled live from the Model using `USE_SIMULATED_PROVIDERS=false` + `MODELO_BASE_URL` (all four switch together.). Crop criteria and the static soil profile remain mocked across all configurations. |
| `Modelo/` | Functional. Trained model and clients **real-world** the NASA POWER y MODIS; exposes live daily weather data on `/api/v1/clima/diario` and live SIAP prices on `/api/v1/precios`. |
| `AppMovil/` | WebView that the UI prototype loads. **It does not consume the backend yet.** |
| Integration | **Parcial.** Backend ↔ already connected to the Model (daily weather, derived soil moisture, NDVI, crop prices, predictions). The app does not call the Backend yet. |

This is a hackathon prototype. Authentication is in place, but the public deployment has not yet been hardened (see Known Limitations).

---

## System Architecture

```
┌─────────────────────────────────────┐
│  AppMovil (Android, WebView)        │
│  Loads a web UI bundle              │
└──────────────┬──────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────┐
│  Backend (Express + TypeScript)     │
│  · Indicators engine                │
│  · Crop rotation engine (rules)     │
│  · Economic engine                  │
│  · Firestore persistence            │
└──────┬───────────────────┬──────────┘
       │ Admin SDK         │ HTTP
┌──────▼─────────┐  ┌──────▼──────────────────┐
│   Firestore    │  │  Modelo (FastAPI)       │
│   + Storage    │  │  · NASA POWER           │
└────────────────┘  │  · MODIS NDVI (ORNL)    │
                    │  · sklearn model        │
                    │  · INIFAP catalog       │
                    └─────────────────────────┘
```

**Separation of responsibilities:** the Model owns external data and predictions, while the Backend owns application state and decision logic. The integration is already in place for daily weather, soil moisture (derived from that weather data), NDVI, and crop prices (with `USE_SIMULATED_PROVIDERS=false` + `MODELO_BASE_URL`); the static soil profile and crop criteria for rotation scoring remain stored in Firestore or mocked).

---

## The three parts

### `Backend/` — API and Decision Engines

Express on TypeScript, using Firestore via the Admin SDK. Requires Node 20 or higher.

```
src/
  engines/
    indicators/   Water balance, rainfall, soil moisture anomaly,
                  soil temperature, bare soil, growing degree days,
                  resolution harmonization, imputation
    rotation/     Strategy generation, compatibility filters, scoring
    economics/    Investment, margin, break-even point, price scenarios
    via/          VÍA assistant: intent, templates, figure verification, optional copywriting
    geo/          Polygon validation, plot area and centroid calculation
  providers/      Data interfaces; mocked by default, live weather/NDVI via Model
  integration/    Model client, contract mapping, crop IDs
  firestore/      Admin SDK, collections, grid cell calculation
  middleware/     Plot owner authentication and service account key
  routes/         health, plots, catalog, prices, internal
  seed/           Crop catalog and demo plot
  types/          Provenance, strategy, business logic, Firestore documents
  validators/     Provenance validator
```

Rutas:

Routes:

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Service health status |
| `GET` | `/plots/:id/indicators` | Environmental indicators for the period |
| `POST` | `/plots/:id/rotations` | Generates and saves crop rotation strategies |
| `GET` | `/plots/:id/rotations` | Latest calculated strategies |
| `POST` | `/plots/:id/economics` | Recalculates using the farmer's input costs |
| `POST` | `/plots/:id/via/ask` | VÍA assistant: answers questions using templates and verified evidence |
| `GET` | `/catalog/crops` | Crop catalog with agronomic criteria |
| `GET` | `/prices/:crop` | Prices by crop |
| — | `/internal/*` | Data ingestion, validation, and dataset endpoints. Requires a service account key |

Price scenarios: `floor` (guaranteed minimum price), `average` (rural average price), `optimistic` (wholesale minus brokerage/intermediation), `drop` (lower historical percentile).

### `Model/` — NASA Data and Predictions

Python whit FastAPI and scikit-learn.

```
agrovia_api/
  clients/nasa_power.py   NASA POWER client
  clients/ornl_modis.py   MODIS NDVI client (ORNL DAAC)
  geo.py                  Municipality detection by coordinates
  catalogs.py             INIFAP crop catalog
  agronomy.py             Rule-based agronomic evaluation
  model_runner.py         Trained pipeline adapter
  service.py              Evaluation composition
  schemas.py              Input and output schemas/contracts
  main.py                 FastAPI application
datasets/
  cultivos_inifap.json
  municipios_durango.json
  datasets_cierre_agricola_raw_data/   SIAP 2016-2025
modelo_agrovia.joblib     Trained pipeline
train_model.py            Model training
clean_siap.py             SIAP data cleaning
fetch_historical_nasa.py  Historical NASA data downloader
```

Routes:

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Service status and version |
| `POST` | `/api/v1/evaluar-parcela` | Evaluates a full plot profile |
| `GET` | `/api/v1/evaluar-parcela/ejemplo` | Evaluates the bundled sample plot |
| `POST` | `/api/v1/clima` | Aggregated weather data over a time window |
| `POST` | `/api/v1/clima/diario` | Live daily time series from NASA POWER (days with available data only) |
| `POST` | `/api/v1/ndvi` | NDVI time series over a time window |
| `POST` | `/api/v1/predecir` | Runs the model on pre-resolved features/variables |
| `GET` | `/api/v1/municipio` | Nearest municipality to given coordinates |
| `GET` | `/api/v1/cultivos` | INIFAP crop catalog |

**The model:** A scikit-learn `Pipeline` binary classifier for harvest success, using 8 input features:

```
cultivo_id, modalidad, cve_mun, lluvia_ciclo_mm,
temp_media_c, temp_max_c, temp_min_extrema_c, radiacion_mj_m2
```

The output probability is mapped into three risk/confidence tiers: `alto` (high, ≥ 0.66), `medio` (medium, ≥ 0.33), and `bajo` (low).

Detailed technical documentation is available in `Modelo/DOCUMENTACION_TECNICA_MODELO.md`.

### `AppMovil/` — Android Application

`AppMovil/AgroViaAndroid/agrovia-figma-android-/` is a single-activity Gradle project that opens a `WebView` and loads the UI bundle from `app/src/main/assets/www/`.

The interface consists of a home screen and three core modules:

- **My Plot** — plot registration, map view, logged events, and seasonal history.
- **Intelligence** — environmental indicators, crop rotation comparisons, and the VÍA assistant.
- **Market** — price trends, buyers, and a business model calculator with break-even analysis.

Requested permissions: internet, location, and microphone (for VÍA voice input).

---

## Cómo correrlo

## Getting Started

### Prerequisites
- Node.js 20 or higher
- Python 3.12 or higher
- JDK 17 and the Android SDK
- A Firebase project with Firestore enabled
- A free NASA Earthdata account for MODIS data access

### Backend

```bash
cd Backend
npm ci
cp .env.example .env     # fill in the environment variables
npm run seed             # crop catalog and demo plot
npm test                 # 32 test suites (requires Firestore and Auth emulators)
npm run lint
npm run build

Para correr las pruebas con los emuladores, desde la raíz:

```bash
npx firebase-tools emulators:exec --only firestore,auth --project agrovia-ci "cd Backend && npm test"
```

Firestore security rules and indexes are located in `Backend/firestore.rules` and `Backend/firestore.indexes.json`. Deploy them using the Firebase CLI from the repository root, where `firebase.json` and `.firebaserc` are located.

### Model

```bash
cd Modelo
pip install -r requirements.txt
pytest
uvicorn agrovia_api.main:app --reload

Prueba rápida de la API, con el servicio arriba:

curl http://localhost:8000/api/v1/evaluar-parcela/ejemplo

Model testing without starting the API:

```bash
python probar_modelo.py
python test_escenarios_modelo.py

### AppMovil

```bash
cd AppMovil/AgroViaApp/agrovia-figma-android-
./gradlew :app:assembleDebug
```

From VS Code, run the default build task (`Ctrl+Shift+B`) or `Tasks: Run Task` →
`Android: Run on emulator`. It boots the `Pixel_7` AVD if needed, builds, installs and launches
the app. Individual steps are available as separate tasks; the underlying scripts live in
`scripts/android/`.

---

## Data

### NASA Data Sources

| Source | Variables | Resolution |
|---|---|---|
| **NASA POWER** | `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `GWETPROF`, `TS`, `ALLSKY_SFC_SW_DWN`, `WS2M` | ~0.5° × 0.625°, daily since 1981 |
| **SMAP SPL4SMGP** | `sm_surface`, `sm_rootzone`, `sm_rootzone_pctl`, `soil_temp_layer1` | 9 km, every 3 hours since 2015 |
| **GPM IMERG** | Estimated precipitation | 0.1° (~10 km), daily since 2000 |
| **MODIS MOD13Q1** | NDVI, EVI, and quality band | 250 m, every 16 days |
| **SRTM / NASADEM** | Elevation, used to derive slope | ~30 m, static |

NASA POWER does not require an account. The remaining sources require an Earthdata Login. To extract point or polygon time series from MODIS, SMAP, ECOSTRESS, and SRTM, **AppEEARS** is recommended, as it returns CSV files with the quality band included rather than raw HDF5 files. Because its tasks run asynchronously, it is suitable for preloading data rather than serving live requests.

### Complementary Sources

- **SoilGrids 250m (ISRIC)** — soil texture, organic carbon, pH, and CEC. Global coverage.
- **FAO GAEZ** — crop suitability and agro-climatic requirements.
- **SIAP** — rural average price and yield by crop and municipality. Data from 2016 to 2025 stored in `Modelo/datasets/`.
- **SNIIM** — daily wholesale prices.
- **Guaranteed prices** — price floors for smallholder farmers, sourced from DOF operating rules.
- **INIFAP** — agronomic criteria by crop.
- **SMN / CONAGUA, Station 10030** — daily weather records used to validate satellite sources against ground-based observations.

### Incompatible Data Sources

These sources cover the United States exclusively and return no data for Durango. Disregard them if they appear in older notes: **PRISM**, **Web Soil Survey / SSURGO / gNATSGO (USDA-NRCS)**, **CoCoRaHS**, **USGS Water Data**, **USDA NASS QuickStats**, and, for the most part, **USDA Ag Data Commons**.

Note on SMAP: the correct product is **`SPL4SMGP`**. **`SPL1A_RO`** is a Level 1A receive-only radar product containing sigma-naught ($\sigma^0$) backscatter and raw telemetry—it does not provide soil moisture data.

### Indicadores derivados

Lluvia acumulada a 5, 10, 15 y 30 días · días con lluvia · lluvia extrema sobre el percentil 95 de la celda · rachas secas · balance hídrico · anomalía de humedad del suelo · temperatura del suelo suavizada · días de helada · días de estrés térmico · grados-día acumulados · meses de suelo desnudo · desvío de NDVI contra años previos · pendiente.

---

### Derived Indicators

5-, 10-, 15-, and 30-day cumulative rainfall · rainy days · extreme rainfall above the cell's 95th percentile · dry spells · water balance · soil moisture anomaly · smoothed soil temperature · frost days · heat stress days · accumulated growing degree days · bare soil months · NDVI anomaly vs. previous years · slope.

---

## Design Principles

These are not decorative guidelines: they are the acceptance criteria used to approve or reject any change.

1. **No fabricated data.** If a data source fails to respond, the response explicitly states it. There are no silent averages or default fallback values disguised as actual measurements.
2. **Mandatory provenance.** Every data point carries `source`, `product`, `version`, `asOf`, `latencyDays`, `kind`, and `origin`. Data missing any of these fields is treated as an error, not an incomplete record.
3. **Mocked data is explicitly flagged** and distinguished from live/real data in both the API response and the user interface.
4. **Explainable.** Every score breaks down transparently by criterion and weight—no black boxes.
5. **The rotation engine is rule-based with documented thresholds.** The machine learning model contributes just one additional variable to the overall score; it never makes decisions on its own.
6. **Reproducible.** Every indicator and strategy stores the exact version of both the engine and the crop catalog used to generate it.
7. **Transparent about data gaps.** Every strategy explicitly states what information is missing and which risks require review by a local agronomist.
8. **Decision support, not replacement.** The tool is never presented as a definitive agronomic diagnosis.

---

## Repository Structure

```text
AppMovil/          Android application with WebView
Backend/           Express API and decision engines
Modelo/            Machine learning model and NASA data clients
assets/            Shared assets
docs/              Documentation
scripts/           Linting utilities and CI test scripts
firebase.json      Firebase deployment configuration
requirements.txt   Root Python dependencies
```bash
git config core.hooksPath .githooks
```

---

## Contributing

Read `CONTRIBUTING.md`. In short: one branch per topic, small commits, tests accompanying every behavioral change, and never commit credentials to the repository.

---

## Known Limitations

- **Mocked providers by default.** Weather, soil moisture, NDVI, and crop prices can use live data (`USE_SIMULATED_PROVIDERS=false` + `MODELO_BASE_URL`—all four switch together), but **the static soil profile (texture, slope) and the crop criteria catalog for rotation scoring remain mocked/manually seeded** in all configurations—there is no SoilGrids/SRTM client yet, and the Model's INIFAP catalog lacks the fields required by the rotation engine. Every data point declares `provenance.origin` (`real`/`simulated`/`demo`), which the UI must honor. Details on the pending contract are available in `INTEGRACION_FASE2.md`.
- **The mobile app does not yet consume the backend.** The UI currently serves demo data.
- **VÍA is not a large language model (LLM).** It responds using deterministic templates and verifies that every figure is backed by evidence. Questions outside supported intents return `intent: "unknown"` with no numbers. Optional AI phrasing/polishing is disabled by default (requires `ANTHROPIC_API_KEY` and `VIA_POLISH_MODEL`) and can never introduce new figures.
- **VÍA describes recorded data; it does not forecast.** There is no weather forecasting model: a question about "tomorrow" is answered using the observed climate time series from the analyzed window, not a prediction.
- **The plot polygon is optional and does not override the declared area.** If the calculated surface area differs from `areaHa` by more than 10%, an `infoGap` is reported; the declared area is never overwritten. The calculation assumes small, non-polar plots that do not cross the antimeridian.
- **Satellite resolution is much coarser than an individual plot.** A SMAP grid cell measures 9 km across, and a NASA POWER cell measures roughly 50 km. Indicators represent regional context rather than plot-level measurements, and the UI must clearly state this.
- **No in-field hardware sensors.** The ESP32-based sensor device was ruled out due to low adoption feasibility for farmers; all soil variables are derived from historical satellite records.
- **Satellite data has latency.** The GPM IMERG *Final* run takes months to release; for recent dates, the *Late* run is used, which is less accurate. Actual NASA POWER latency is not exposed by the Model: provenance uses `latencyDays: 0` as a placeholder rather than an actual measurement.

---

## Credits and Attribution

NASA POWER data: "These data were obtained from the NASA Langley Research Center POWER Project funded through the NASA Earth Science Directorate Applied Science Program."

MODIS NDVI distributed by ORNL DAAC. SMAP soil moisture and GPM precipitation distributed by NASA DAACs. Soil properties from SoilGrids (ISRIC, CC BY 4.0). Crop suitability from FAO GAEZ. Agricultural statistics and market prices from SIAP and SNIIM. Agronomic criteria from INIFAP. Climatological records from SMN/CONAGUA.
