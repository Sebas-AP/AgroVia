# AGROVÍA Backend — Design Spec

> Source: a construction brief provided by the project owner (Spanish). Translated to English per repo-wide
> language policy (root `AGENTS.md`). The translation is a 1:1 rename of collections, fields, and types —
> no semantics were changed. A later, separate feature may let the app UI display Spanish labels (locale
> setting); the underlying schema/API stay English regardless (owner decision, 2026-11-14).

## 0. How to use this document

1. Read all of it before writing a line of code.
2. Produce `PLAN.md` first, in `Backend/` (the component this spec belongs to): architecture, folder
   structure, library choices with justification, task order, risks, and open questions. **No code before
   `PLAN.md` exists and is reviewed.**
3. Build in the order given in §15.
4. If information is missing, note it under "Open questions" in `PLAN.md`, take the most reasonable
   assumption, mark it in code with a `// ASSUMPTION:` comment, and continue.

---

## 1. Context

**Project:** AGROVÍA, a farm decision-support tool built for the "Adapting Farms with NASA Data" challenge,
NASA Space Apps 2026.

**Pilot area:** Guadalupe Victoria, Durango, Mexico. Center: `lat 24.4497, lon -104.1225`, ~2,000 m
elevation. Semi-arid highland plateau, rainfed agriculture. Local crops: grain corn, beans, forage oats,
forage sorghum, forage corn.

**What the product does:** takes open NASA environmental history, cross-references it with plot
characteristics, documented agronomic criteria, and official Mexican prices, and delivers a comparison of
**crop rotation strategies**. Each strategy explains why it's suggested, what evidence backs it, what
benefits it offers, how much it could yield, what information is missing, and what risks a local agronomist
should review.

**Challenge requirement that defines the deliverable:** compare **at least three rotation strategies,
including the current one**, each with: why it's suggested, what evidence backs it, what benefits it
offers, where information gaps exist, and what risks need local review.

**The farmer does not enter environmental data.** They register their plot once; the system fetches
everything else from sources.

---

## 2. Out of scope — do not work on this

1. **No frontend.** Do not touch Flutter, React, HTML, or CSS, or any screen. The app is being built by
   another part of the team and delivered separately. Your output is the backend and database, consumable
   over HTTP and via the Firestore SDK.
2. **No machine learning.** Do not train, implement, or evaluate any model. The team will generate a model
   from the dataset later. Your job is to leave the dataset clean and documented for them to consume (§12).
3. **The rotation engine is rule-based with explicit weights, not a model.** If at any point a classifier
   seems like the right call, don't build it: note it as a suggestion in `PLAN.md` and continue with rules.
   Rules are auditable, and that's what the challenge rewards.
4. Do not design logos, marketing copy, or the presentation.

---

## 3. Stack and tooling

- **Backend:** Node.js with **Express** and TypeScript.
- **Database:** **Firestore**. Already linked via the Firebase MCP server (project `agrovia-48930`), so you
  can create and modify collections, documents, composite indexes, and security rules directly. Use it.
- **Raw files:** Cloud Storage (or a local `./data/raw` folder in development, behind the same interface).
- **Firestore access from the backend:** Admin SDK.

**Note on Firestore:** no tables, no rigid schema. "Structure" here means collections, document shape,
**composite indexes**, and **security rules**. Create all three, not just the documents.

**Secrets:** NASA Earthdata credentials and any keys go in environment variables and in `.env.example`
with no values. Never in the repository, never in an API response, never in a Firestore document.

---

## 4. Non-negotiable rules

1. **Provenance is mandatory.** No data enters the system without `source`, `product`, `version`, `asOf`
   (cutoff date), and `latencyDays`. Data missing any of these five fields is an error, not incomplete data.
2. **Simulated data is marked.** Any value that doesn't come from a real source carries `origin: "simulated"`
   and is exposed as such in the API. It must never be mistakable for real data.
3. **Explainable.** Every score decomposes by criterion and weight. No black box.
4. **Replaceable.** Every source enters through an interface (`ClimateProvider`, `SoilMoistureProvider`,
   `NdviProvider`, `SoilProvider`, `PricesProvider`, `CropCriteriaProvider`). Implement the simulated version
   first, then the real one, without touching the engines.
5. **Reproducible.** Every indicator and every strategy stores `engineVersion` and `catalogVersion`. Any
   recommendation must be regenerable identically.
6. **Honest about gaps.** If data is missing, the response says so. Never silently fill with an average.
7. **Criteria carry sources.** Every agronomic criterion stores its reference and whether it is
   `documented` or `assumed`.

---

## 5. Data sources

### 5.1 What to use

**NASA POWER** — REST API, global, daily since 1981, **no account needed**. The backbone: start here
because it has no auth friction.
Parameters to extract: `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `GWETPROF`,
`TS`, `ALLSKY_SFC_SW_DWN`, `WS2M`.
Community: `AG`. Resolution ~0.5° × 0.625° (~50 km).
**Limit: max 20 parameters per call.**

**SMAP SPL4SMGP v8** — via **AppEEARS**, 9 km, every 3 hours since 2015. Requires Earthdata Login.
Bands: `sm_surface` (0–5 cm), `sm_rootzone` (0–100 cm), `sm_rootzone_pctl`, `soil_temp_layer1`.
**Important: do NOT use `SPL1A_RO`.** It's an L1A radar receive-only product: raw sigma-naught and
telemetry, not soil moisture. If a project note references it, that note is wrong.

**GPM IMERG V07** — 0.1° (~10 km), daily since 2000. Earthdata Login.
Product: `GPM_3IMERGDF` for history (*Final* run) and `GPM_3IMERGDL` (*Late*) for recent days, because
*Final* lags by months.

**MODIS MOD13Q1** — via AppEEARS, 250 m, every 16 days. Bands: NDVI, EVI, and the quality band (respect
it — discard bad pixels).

**SRTM / NASADEM** — via AppEEARS, ~30 m, static. Elevation, from which slope is derived. Once per plot.

**SoilGrids 250m v2 (ISRIC)** — global, static, no account. Texture (sand, silt, clay), organic carbon,
pH, CEC, bulk density. Its REST API is paused: use the GeoTIFF download or the WCS service.

**FAO GAEZ v5** — crop suitability and agroclimatic requirements. For filtering candidate crops.

**SIAP** — rural average price (MXN/kg) and yield (t/ha) by crop and municipality. **SNIIM** — daily
wholesale price. **Guaranteed prices** (Alimentación para el Bienestar, DOF operating rules) — floor price
per ton and small-producer limit (up to 5 ha).

**SMN / CONAGUA, station 10030 (Guadalupe Victoria)** — daily records of precipitation, evaporation, max
and min temperature. `.txt` format with "Nulo" as the missing-value marker. **This is the ground truth used
to validate** (§11).

**AppEEARS** — the shortcut: extracts MODIS, SMAP, ECOSTRESS, and SRTM by point or polygon and returns CSV
with a quality band, instead of downloading and processing raw HDF5. Has an API.
**Its tasks are async and queued: never call it inside an HTTP request cycle.** Use it only from scheduled
jobs that pre-load data.

### 5.2 What NOT to use

These sources are **US-only** and return nothing for Durango. If found in project notes, ignore them:
**PRISM**, **Web Soil Survey / SSURGO / gNATSGO (USDA-NRCS)**, **CoCoRaHS**, **USGS Water Data**,
**USDA NASS QuickStats**, and most of **USDA Ag Data Commons**.

---

## 6. Firestore structure

Create collections, indexes, and rules. Use the Firebase MCP.

```
users/{uid}
  name, role, createdAt, locale

plots/{plotId}
  ownerUid, name,
  center: { lat, lon },                      // the only geographic field trusted for now
  areaHa, mode: "rainfed"|"irrigated",
  currentCrop, declaredSoilType, elevationM,
  country, state, municipality, locality,
  powerCellId, gpmCellId, smapCellId,         // see grid-cell cache note below
  priorities: { water, income, forage, nitrogen, erosion, organicMatter, market },  // 0-5
  constraints: { waterAvailability: "low"|"medium"|"high", equipment: string[] },
  origin: "real"|"demo",
  createdAt, updatedAt

plots/{plotId}/seasons/{seasonId}
  year, crop, yieldTonHa, origin
  // The CURRENT ROTATION is reconstructed from this. Mandatory for strategy A.

plots/{plotId}/events/{eventId}
  date, type, note

plots/{plotId}/static/profile
  slopeDegrees, elevationM, sandPct, siltPct, clayPct,
  organicCarbon, pH, cec, waterRetentionMm,
  source, product, version, asOf
  // Computed ONCE per plot from SRTM + SoilGrids.

plots/{plotId}/indicators/{YYYY-MM}
  rainAccumMm, rainyDays, extremeRainDays, maxDrySpellDays,
  waterBalance5d, waterBalance10d, waterBalance15d, waterBalance30d,
  surfaceSoilMoisture, rootZoneSoilMoisture, moistureAnomalyPctl,
  soilTempAvg7d, soilTempAvg10d,
  airTempAvg, airTempMax, airTempMin, relativeHumidityAvg,
  frostDays, lastFrostDate, heatStressDays, growingDegreeDaysAccum,
  ndviAvg, ndviDeviationVsYears, bareSoil: boolean,
  sources: [...], asOf, engineVersion

cells/{cellId}
  type: "power"|"gpm"|"smap"|"modis", bbox, resolutionKm

cells/{cellId}/series/{YYYY-MM-DD}
  values: {...}, product, version, asOf, latencyDays, blobPath

cropCatalog/{cropId}
  name, cycleDays, baseTempC, optimalTempC, maxTempC,
  waterRequiredMm, fixesNitrogen: boolean, rootDepthCm,
  organicMatterContribution: "low"|"medium"|"high",
  pestRisk: string[], plantingWindow: { start, end },
  droughtTolerance: "low"|"medium"|"high",
  source, reference, criterionType: "documented"|"assumed"

prices/{cropId}/snapshots/{YYYY-MM-DD}
  ruralAvgPriceKg, wholesalePriceKg, guaranteedPriceTon,
  yieldTonHa, municipality, source, asOfDate

plots/{plotId}/business/current
  crop, area, seed, fertilizer, water, labor,
  machinery, transport, other, yieldTonHa, priceTon
  // Entered by the farmer. The only thing they actually type.

strategies/{strategyId}
  plotId, type: "current"|"alternative", sequence: [{year, crop}],
  rationale, evidence: [...], benefits: [...], economics: [...],
  infoGaps: [...], risks: [...],
  scores: { water, soil, climateRisk, pests, economy, market },
  totalScore, generatedAt, engineVersion, catalogVersion

validations/{validationId}
  satelliteSource, stationId, variable, period,
  bias, meanAbsoluteError, correlation, sampleCount, generatedAt
```

### Grid-cell cache — important

**Do not store climate series per plot.** An SMAP cell is 9 km and a POWER cell is ~50 km: dozens of plots
fall in the same cell. By storing per cell, the system scales to the whole municipality with the same
downloads. Each plot stores its cell id, and the engines read from `cells/`.

Compute `cellId` by rounding the plot's center to each product's grid, deterministically. Document the
formula.

### Composite indexes to create
- `strategies`: `plotId` ascending + `generatedAt` descending.
- `prices/{cropId}/snapshots`: `asOfDate` descending.
- `cells/{cellId}/series`: `asOf` descending.
- `plots/{plotId}/seasons`: `year` descending.

### Security rules
- `plots` and all its subcollections: read and write only if `request.auth.uid == resource.data.ownerUid`.
- `cropCatalog`, `cells`, `prices`, `validations`: read for authenticated users, **write only from the
  Admin SDK**.
- `strategies`: read only by the plot's owner, **write only from the server**, so nobody can tamper with a
  score.
- Nobody can write provenance fields from the client.

### Seed data to create
1. `cropCatalog` with grain corn, beans, forage oats, and forage sorghum, each with a source (INIFAP, FAO,
   or GAEZ). Whatever isn't documented, mark `criterionType: "assumed"`.
2. One demo plot **in Guadalupe Victoria** (`24.4497, -104.1225`, ~2,000 m elevation, rainfed, 9.6 ha) with
   two seasons of history: corn last year, beans two years ago. Mark everything `origin: "demo"`.

---

## 7. Core types

```ts
export type DataOrigin = 'real' | 'simulated' | 'demo'
export type DataKind = 'historical' | 'satelliteObservation' | 'estimated' | 'recorded'

export interface Provenance {
  source: string; product: string; version: string
  asOf: string; latencyDays: number; kind: DataKind; origin: DataOrigin
}

export interface Evidence {
  label: string; value: string; unit: string; period: string
  provenance: Provenance
}

export interface BusinessInputs {
  crop: string; area: number
  seed: number; fertilizer: number; water: number; labor: number
  machinery: number; transport: number; other: number
  yieldTonHa: number; priceTon: number
}

export interface EconomicResult {
  investment: number; production: number; revenue: number; profit: number
  costPerHa: number; costPerTon: number; marginPct: number
  breakEvenTon: number; breakEvenYield: number
}

export type PriceScenario = 'floor' | 'average' | 'optimistic' | 'drop'

export interface RotationStrategy {
  id: string
  type: 'current' | 'alternative'
  sequence: { year: number; crop: string }[]
  rationale: string                // which rules fired, in plain language
  evidence: Evidence[]
  benefits: string[]
  economics: { scenario: PriceScenario; priceTon: number; result: EconomicResult }[]
  infoGaps: string[]               // what's missing for a better decision
  risks: string[]                  // what a local agronomist should review
  scores: { water: number; soil: number; climateRisk: number
            pests: number; economy: number; market: number }
  totalScore: number
  summary: { sequenceText: string; shortRationale: string; avgMargin: number }
  engineVersion: string; catalogVersion: string; generatedAt: string
}
```

The `summary` field exists because the app's card opens showing **only three facts**: the sequence, one
line on why, and the average-scenario margin. All detail sits behind a button. Compute it yourself — don't
leave it to the frontend.

---

## 8. Indicators engine

Compute, from the series in `cells/`, everything listed in `plots/{id}/indicators/{YYYY-MM}`.

Calculation rules:
- **Water balance** = accumulated rain minus accumulated evapotranspiration, over trailing 5/10/15/30-day
  windows, including the current day.
- **Extreme rain** = days above the historical 95th percentile **of that cell**, not a fixed threshold.
- **Dry spell** = consecutive days under 1 mm.
- **Moisture anomaly** = use SMAP's `sm_rootzone_pctl` when available; otherwise, the percentile against the
  cell's own climatology.
- **Soil temperature** = 7-day and 10-day moving average.
- **Bare soil** = NDVI below the cover threshold, quality band respected.
- **Growing degree days** = accumulation above the crop's `baseTempC`.
- **Slope** = from SRTM, once per plot.

**Harmonization:** the products have different resolutions (50 km, 10 km, 9 km, 250 m). Aggregate
everything to **monthly per plot** before combining, and **document the resampling in `PLAN.md` and in a
module comment**. The challenge explicitly asks for this.

**Imputation:** interpolate gaps of up to 3 days in temperature and evaporation. **Never impute
precipitation**: a missing value is not a zero. Mark every imputed value.

---

## 9. Rotation engine

Pure module, no Express or Firestore dependency: takes data in, returns strategies. That way it's testable.

**Inputs:** plot, static profile, seasons, priorities, period indicators, crop catalog, prices by scenario.

**Generation:**
- **Strategy A** = current rotation, reconstructed from `seasons`. If there's no history, use the current
  crop and mark it as an info gap.
- **B and C (and D if possible)** = 2–3 year alternatives generated from the catalog.

**Compatibility filters:** suitability by thermal zone and water (GAEZ and catalog criteria), declared
water availability, available equipment, planting window, and a penalty for repeating the same crop
consecutively when the criteria call for it. Alternatives must be **distinct from each other**: if two end
up identical, drop one and generate another.

**Per-criterion score, 0 to 100, weighted by the plot's priorities:**
- `water`: crop water demand against the observed water balance.
- `soil`: nitrogen fixation, organic-matter contribution, cover (fewer bare-soil months), erosion (slope
  and texture).
- `climateRisk`: frost and heat stress against the crop's cycle.
- `pests`: cycle interruption relative to history.
- `economy`: margin per hectare in the average scenario.
- `market`: price spread across scenarios (less spread, more stability).

Document every threshold with its source. A threshold without a source is marked `assumed`.

**Output:** `RotationStrategy[]` with **a minimum of three entries, always including the current one**. If
three can't be generated, return what there is and explain why in `infoGaps`: never fabricate a strategy
just to hit the count.

---

## 10. Economics engine

```
investment = seed + fertilizer + water + labor + machinery + transport + other
production = area * yieldTonHa
revenue = production * priceTon
profit = revenue - investment
costPerHa = investment / area
costPerTon = investment / production
marginPct = profit / revenue * 100
breakEvenTon = investment / priceTon
breakEvenYield = investment / priceTon / area
```

**Four price scenarios per strategy:**
- `floor`: guaranteed price, **only if** the area meets the small-producer limit and the crop qualifies.
  If it doesn't qualify, the floor is the lowest historical rural average price.
- `average`: SIAP rural average price for the municipality.
- `optimistic`: SNIIM wholesale price minus a parametrizable intermediation discount.
- `drop`: the low percentile of the historical price series.

If a division lands on zero, return `null`, never `Infinity`, and explain it in `infoGaps`. Costs are
entered by the farmer: if there's no `business/current`, use catalog defaults marked `origin: "simulated"`.

---

## 11. Validation against the SMN station

This replaces the field sensor that was dropped, and is the project's evidence of scientific validity.

1. Read the daily file for station **10030 (Guadalupe Victoria)** from SMN. `.txt` format with a metadata
   header and "Nulo" for missing values. Also handle `-9999`-style codes.
2. Compare, over the same period, the station's precipitation and temperature against the POWER cell and
   the GPM cell.
3. Compute bias, mean absolute error, correlation, and sample count.
4. Store in `validations/`.
5. Expose the result at `GET /internal/validation/smn`.

Do not adjust the satellite data using this. The goal is to **report** the difference, not correct it.

---

## 12. Dataset delivery for the ML team

Do not train anything. Just leave the dataset ready and stable:

- Generate one file per plot, one row per day or month, one column per indicator, plus provenance columns.
- Format: CSV with `utf-8-sig`, plus JSON Lines.
- Include a `dataset_schema.json` describing each column: name, unit, source, resolution, whether it's
  measured, modeled, or imputed, and valid range.
- Expose `GET /internal/dataset/:plotId?format=csv|jsonl`.
- Document in `PLAN.md` which columns are target-variable candidates and which have information leakage,
  but **do not build the model**.

---

## 13. Express routes

```
GET  /health
GET  /plots/:id/indicators?from=&to=
POST /plots/:id/rotations          → generates and stores strategies
GET  /plots/:id/rotations          → latest computed ones
POST /plots/:id/economics          → recomputes with the farmer's costs
GET  /catalog/crops
GET  /prices/:crop
POST /internal/ingest/:source      → service-key only
GET  /internal/validation/smn
GET  /internal/dataset/:plotId
```

Every `/internal/*` route requires a service key header. Validate and sanitize all input. Return errors in
a stable shape: `{ error: { code, message, detail } }`.

**No route may call AppEEARS synchronously.** Ingestion runs in scheduled jobs.

---

## 14. Tests

Mandatory, with expected-result cases:
- Raising the `water` priority weight raises the score of low-water-consumption strategies.
- Once area exceeds 5 ha, the guaranteed price stops applying as a floor.
- With seed cost at zero, profit rises by exactly that cost.
- There are always at least three strategies, and the current one is included.
- A missing precipitation value never becomes a zero.
- Data missing provenance fields is rejected by the validator.
- Two nearby plots share a `cellId` and don't trigger two downloads.
- `cellId` computation is deterministic for the same coordinate.
- Same inputs and same `engineVersion` produce the same strategy.

---

## 15. Build order

1. `PLAN.md`, folder structure, TypeScript, linter, and tests configured.
2. §7 types and the provenance validator.
3. Firestore structure: collections, indexes, and rules, via MCP.
4. Seeds: `cropCatalog` with sources and the Guadalupe Victoria demo plot.
5. Providers in **simulated** version, with the final interface.
6. Indicators engine, with documented harmonization, and its tests.
7. Rotation engine and economics engine, with their tests. **This is where the challenge's core
   requirement is met, still without real connections.**
8. Express routes over the engines.
9. Real `worker-power`: NASA POWER with per-cell caching. First real source, no account needed.
10. `worker-prices`: SIAP, SNIIM, and guaranteed prices, with dated snapshots.
11. Real `worker-gpm`.
12. `worker-static`: SRTM and SoilGrids, once per plot.
13. Validation against the SMN station.
14. `worker-smap` and `worker-ndvi` via AppEEARS, async.
15. Dataset delivery and `dataset_schema.json`.
16. `README.md`: how to run, environment variables, data flow, and what's simulated vs. real.

Steps 1–8 need no credentials: they can be finished entirely with simulated providers.

---

## 16. Acceptance criteria

- `POST /plots/:id/rotations` on the demo plot returns three or more strategies, the current one included,
  each with all seven sections and the three-fact `summary`.
- Changing a plot's priorities changes the scores in a way that's explainable and verifiable in tests.
- Changing the price scenario changes the economics of every strategy.
- Every figure from the API carries full provenance, and simulated data is marked as such.
- Security rules prevent a client from writing a strategy or a provenance field.
- Two plots in the same cell don't cause two downloads.
- `GET /internal/validation/smn` returns bias and mean error against station 10030.
- The dataset exports with its `dataset_schema.json`.
- The test suite passes and the README explains what's real vs. simulated.

---

## 17. Open questions to note, not resolve alone

- Where the backend deploys: Cloud Run, Firebase Functions, or a VPS.
- Whether the team wants Firebase anonymous auth or email-based auth.
- Which agronomic thresholds the team accepts as documented vs. which stay `assumed`, for an agronomist to
  review.
- A team prototype called **PreciosTracker** exists with pricing and alternatives logic not yet available
  in this session. Keep price providers and alternative-generation behind their interfaces so that logic
  can replace them later without rewriting the engines.
- **Resolved during spec translation (2026-11-14):** schema, types, routes, and code stay English-only per
  repo policy. A later, separate feature may add a user-facing locale/i18n setting so the app UI can display
  Spanish labels without touching the underlying English schema/API. Not part of this build.
