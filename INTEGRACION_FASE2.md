# Integration Phase 2 — diagnosis and plan

This document closes the phase that was left half-done between the initial integration
(`INTEGRACION.md`) and the next block of work. It records **what was implemented**, **what is
still simulated and why**, **which contracts must be opened** to close each gap, and **in what
order**.

The rule that governs everything below: if a datum is not there, say so. It is not filled in, not
silently averaged, and never presented as a measurement when it is a demonstration value.

---

## 1. What this phase closed

### 1.1 Modelo: real daily NASA POWER series

Already done when the phase started (`9b40dae`): `fetch_daily_series()` and
`POST /api/v1/clima/diario`, with their own parameters (`DAILY_SERIES_PARAMETERS`) separate from
the aggregate route, a per-(lat, lon, window) cache, and the rule that **a day with no real
reading stays absent from its dictionary**, never filled in.

### 1.2 Backend: `ModeloClimateProvider`

- Implements `ClimateProvider.getDailySeries` against `POST /api/v1/clima/diario`.
- Enabled by `USE_SIMULATED_PROVIDERS=false` **and** `MODELO_BASE_URL`; without both, the
  `SimulatedClimateProvider` stays in place.
- Decodes the point from the grid-snapped `cellId` (`firestore/cellId.ts`) because Modelo's route
  is point-based, not cell-based.
- **Returns a dense array**: one entry per calendar day, with `values: {}` for days with no
  reading. That is not data fabrication; it preserves the calendar so `imputeGaps` can still
  detect gaps by array position. Dropping empty days would silently break gap detection.
- Tests: `Backend/tests/providers/modeloClimateProvider.test.ts` against a Modelo double (absent
  day, partial day, URL/body sent, propagated 502).

### 1.3 Backend: VÍA assistant endpoint

`POST /plots/:id/via/ask`, protected by `plotOwnerAuth` (same `401`/`403`/`404` as the rest).

- Deterministic intent classification (`engines/via/intents.ts`): `water`, `soilMoisture`,
  `temperature`, `ndvi`, `strategies`, `economics`, `market`, `plot`, `unknown`.
- **Template** answers, never generated free text (`engines/via/index.ts`). The template builds
  the prose and the evidence in the same call (`cite()`), so a figure cannot enter the text
  without its evidence entry.
- **Automatic verification** (`engines/via/verification.ts`): every figure in `answer` must exist
  in `evidence`, otherwise the answer is not returned. Covered by unit and route tests.
- Optional AI rewriting (`engines/via/polisher.ts`): off by default. Enabled only with both
  `ANTHROPIC_API_KEY` **and** `VIA_POLISH_MODEL`; a rewrite that introduces new figures is
  discarded, the template is returned, and an `infoGap` records why.
- If there is no data for the question, `evidence` is empty, the answer says so in words, and
  `infoGaps` explains what is missing. A question outside the supported intents returns
  `unknown` with no figures.
- Documented in `docs/guia-frontend.md` §4 and `docs/ejemplos-api.http`.

### 1.4 Backend: optional plot polygon

- `PlotSnapshot.polygon?: { lat, lon }[]`, open or GeoJSON-style closed.
- Validation (`geo/polygon.ts`): at least 3 distinct vertices, WGS84 ranges, non-zero area
  (collinearity detected with a planar shoelace check, not with the geodesic area).
- Geodesic surface and centroid (`polygonAreaHa`, `polygonCentroid`).
- `geo/plotGeometry.ts`: if the surface differs from `areaHa` by more than 10 %, an `infoGap` is
  appended to **every** strategy in the batch. **`areaHa` is never overwritten.** An invalid
  polygon is reported as an `infoGap` and `center` keeps being used.
- `integration/modeloMapper.ts` uses the centroid when the polygon is valid.
- Tests: `tests/geo/polygon.test.ts`, two new cases in
  `tests/integration/modeloMapper.test.ts`, and a route case with a mismatched area in
  `tests/routes/via.test.ts`.
- Firestore rules needed no change: the polygon lives inside the `plots/{id}` document, which the
  owner may already read and write, and it carries no provenance fields a client must not set.

### 1.5 Verification status

| Check | Result |
|---|---|
| Backend `npx vitest run` with emulators | 36 files, 228 tests, all green (re-confirmed after this phase's work) |
| Backend `npx tsc --noEmit` | clean |
| Backend `npx eslint src tests` | clean |
| Modelo `pytest` | 82 passed |
| Modelo `ruff check .` | clean (fixed an import-order and an implicit-string-concat nit found during this verification pass) |

Command used (emulators already running):

```bash
FIREBASE_PROJECT_ID=agrovia-48930 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run
```

---

## 2. Status by provider

This table was rewritten after re-verifying every provider against the actual code (the first
draft undercounted — soil moisture and prices went real in a later pass of this same phase,
without the table being updated to match; README.md had the same staleness and is now fixed too).

| Provider | Real implementation | Expected source | How to enable | Remaining gap |
|---|---|---|---|---|
| Daily climate | **Yes** (`ModeloClimateProvider`) | NASA POWER via Modelo | `MODELO_BASE_URL` set (real is the default; `USE_SIMULATED_PROVIDERS=true` opts back out) | Real latency not exposed by Modelo (`latencyDays: 0` is a marker) |
| Soil moisture | **Yes** (`PowerSoilMoistureProvider`) | Derived from the same NASA POWER daily series (GWETTOP/GWETROOT/TS) | same as climate — reuses the climate provider, no extra HTTP call | Land-surface-model output (`kind: 'estimated'`), not a SMAP satellite observation; `smRootzonePctl` stays `null` (no climatology to compute a percentile against) |
| NDVI | **Yes** (`ModeloNdviProvider`) | MODIS MOD13Q1 via ORNL | same as climate | 16-day composite: a month may have no observation |
| Prices | **Yes** (`ModeloPricesProvider`) | Real historical SIAP municipal closings, bundled from `scripts/build_price_dataset.py` | same as climate | Historical, not live: whatever years the dataset covers, not today's market; no SNIIM wholesale or DOF guaranteed-price source, so `optimistic`/`floor` may come back `null` |
| Static soil profile | No (`SimulatedSoilProvider`) | SoilGrids + SRTM | — | No client; slope needs a DEM. **No longer feeds the rotation score at all** (see §3.8) — kept only as scaffolding for a future real implementation, same pattern as any other not-yet-connected source |
| Crop criteria | Partial (`CropCriteriaProvider` reads Firestore) | Documented INIFAP/FAO | already active | Catalog seeded by hand; `criterionType: assumed` needs agronomist review |
| Model prediction | **Yes**, as an optional scoring criterion | sklearn model | same as climate | `modelSuccess` may be missing per crop; already documented |

**Honest summary:** with `MODELO_BASE_URL` set, climate, soil moisture, NDVI and prices are real
(they switch together, see `providers/runtime.ts`). The static soil profile and the crop-criteria
catalog used for rotation scoring are the only pieces still simulated/hand-seeded in every
configuration, and each is labelled as such in its own `provenance.origin`.

---

## 3. Contracts and decisions worth not reverting

1. **Dense series in the Backend, sparse series in Modelo.** Modelo omits dataless days; the
   Backend reinserts them as `values: {}`. Any future provider (SMAP included) must follow the
   same rule.
2. **The `cellId` represents a cell, not a pixel.** Modelo's routes are point-based; the `cellId`
   is already snapped to each product's grid. A real provider that needs a window (not a point)
   must receive the cell explicitly.
3. **Provenance comes from the response, not invented in the Backend.** `source` and the window
   come from Modelo; `latencyDays: 0` is an explicit marker while Modelo does not expose it.
4. **NDVI has its own provenance.** `PlotIndicators.ndviProvenance` exists so an NDVI figure is
   never backed by the climate provenance.
5. **VÍA does not generate free text.** Templates plus verification. If AI is ever configured, it
   only rewrites and is discarded when it alters figures.
6. **The polygon does not override the declared area.** It is a visible discrepancy, not an
   automatic correction.
7. **Polygon surface is geodesic; collinearity is checked in a planar projection.** Mixing both
   produces false positives on nearly degenerate rings.
8. **The rotation engine's soil score dropped its slope/erosion term instead of simulating it.**
   `scoreSoil` used to read `staticProfile.slopeDegrees` from `SimulatedSoilProvider` — a fully
   fabricated number with no real source behind it. Rather than keep serving that as if it meant
   something, the term was removed and the remaining real, catalog-sourced components (nitrogen
   fixation, organic-matter contribution) are rescaled (`* 100/60`) to stay on the same 0-100
   range, so totalScore's average isn't silently pulled down by removing a fabricated term.
   `routes/plots.ts` no longer calls `SoilProvider.getStaticProfile` at all. The interface and its
   simulated implementation stay in the codebase, unused, as scaffolding for a real SoilGrids/SRTM
   provider later (Step B) — not deleted, since the spec's own pattern is "implement simulated
   first, real later, without touching the engines," and a real implementation will want the same
   interface.

---

## 3.9 `AppMovil/app-src/` is an untouched Vite scaffold, not a frontend rewrite

A `npm create vite@latest` React+TS template sits at `AppMovil/app-src/` (untracked). It is still
the default template end to end — its own `README.md` is the generic Vite one, `App.tsx`/assets
are unmodified. No AGROVÍA screen, no backend call, nothing from the real UI. Point 0 of the
brief ("cómo se recupera el fuente del frontend") is explicitly the user's decision to make, not
something to decide by starting to code one of the three options — so this is left exactly as
found: present on disk, not committed, not built out further. `scripts/android/*.sh` (also new)
is unrelated tooling that formalizes finding the SDK/AVD and booting the emulator for the
*existing* compiled-bundle app — legitimate either way point 0 resolves.

## 4. What remains simulated, and why

- **Soil moisture is real, but a proxy, not true SMAP.** `PowerSoilMoistureProvider` derives it
  from NASA POWER's GWETTOP/GWETROOT/TS (land-surface-model output), not the 9 km SMAP satellite
  product — Modelo has no SMAP client yet (AppEEARS vs. direct SPL4SMGP download is still an open
  choice, Step A). Marked `kind: 'estimated'`, not `satelliteObservation`, so it is never confused
  with a direct measurement.
- **Static soil profile stays simulated**, and no longer feeds the rotation score at all (§3.8).
  SoilGrids 250 m is a simple REST API, but it needs depths, units and a slope layer (DEM) that
  does not exist yet.
- **Prices are real history, not live/current pricing.** `ModeloPricesProvider` serves genuine
  historical SIAP municipal closings — not fabricated, but whatever years the bundled dataset
  covers, not today's market. There is no live SNIIM wholesale feed or versioned DOF
  guaranteed-price table yet, so the `optimistic` and `floor` scenarios legitimately come back
  `null` for crops without a qualifying real source, rather than inventing one.
- **Crop criteria.** The catalog is seeded by hand; entries with `criterionType: "assumed"` are
  labelled as such and need agronomic review.
- **VÍA rewriting.** No AI key is configured and no SDK was added: the default path is 100 %
  templates.

---

## 5. Proposed plan

Ordered by value/risk. Each step ends with its own tests and never touches the no-fabrication
rule.

### Step A — Soil moisture: done with a caveat, true SMAP is the remaining upgrade

`PowerSoilMoistureProvider` already ships a real value (GWETTOP/GWETROOT/TS land-surface-model
output from NASA POWER, which this phase was already fetching for daily climate — no new client,
no new credentials). What's left, if the true 9 km SMAP satellite product is wanted instead of
this land-surface-model proxy:

1. Choose the path: AppEEARS for historical preloading, direct SPL4SMGP download for recent days.
2. Add `POST /api/v1/humedad-suelo` in Modelo with the same shape as daily climate: per day,
   `sm_surface`, `sm_rootzone`, `sm_rootzone_pctl`, `soil_temp_layer1`, and the day absent when
   no valid pixel exists.
3. Point `ModeloSoilMoistureProvider` (today's `PowerSoilMoistureProvider`) at it instead.
4. Acceptance: a window with missing pixels yields empty `values`, not zeros;
   `computeIndicators` reports `null` where appropriate and VÍA adds the `infoGap`.

### Step B — Real static soil profile

1. SoilGrids client (texture, organic carbon, pH, CEC) at 0–30 cm, with a documented unit
   transformation.
2. Slope from a DEM (SRTM/NASADEM) or, without a DEM, declare `slopeDegrees` as `null` and exclude
   the criteria that depend on it.
3. Acceptance: provenance per field or per profile, never partial without saying so.
4. Once connected, `scoreSoil` gets its erosion/slope term back (see §3.8 for why it was removed
   rather than simulated) — undo that rescale when this lands, not before.

### Step C — Prices: real history done, live/current pricing and the guarantee are the gap

`ModeloPricesProvider` already serves real historical SIAP municipal closings (built from the raw
cierre-agrícola CSVs, `scripts/build_price_dataset.py`) — not fabricated, but historical: whatever
years the dataset covers, not today's market, and there is no SNIIM wholesale or DOF
guaranteed-price source yet, so `optimistic`/`floor` legitimately come back `null` for crops
without a qualifying guarantee. To close that gap:

1. A live SNIIM wholesale feed for the `optimistic` scenario.
2. A versioned DOF guaranteed-price table for the `floor` scenario's small-producer case.
3. Acceptance: if there is no datum for that date, `null` + `infoGap`; never another
   municipality's price and never another cycle's.

### Step D — Agronomic review of the catalog

1. A local agronomist reviews every `criterionType: "assumed"` entry.
2. Each reviewed entry records a real `source` and `reference`.
3. Acceptance: no `assumed` entry is presented as documented.

### Step E — Hardening and the app

1. Per-user rate limits on expensive routes (`/rotations`, `/via/ask`).
2. App Check or equivalent for the Android client.
3. The app consumes the Backend (it still serves demonstration data).
4. Acceptance: `docs/guia-frontend.md` no longer talks about mocks.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Presenting a simulated value as real | Mandatory `provenance.origin`; VÍA and strategies expose the source; tests assert the label |
| Breaking gap detection when a real provider is connected | Dense-array contract documented and tested per provider |
| An LLM introduces figures | Verification discards the rewrite; the template is always available |
| A badly digitized polygon changes decisions | Discrepancy → `infoGap`; `areaHa` untouched |
| Low NASA/ORNL availability | Modelo cache + explicit `502`; never filler data |

---

## 7. How to run it locally

```bash
# Backend, fully simulated (default)
cd Backend && npm run seed && npm run build && node dist/server.js

# Backend with real daily climate and NDVI from Modelo
USE_SIMULATED_PROVIDERS=false MODELO_BASE_URL=http://localhost:8000 node dist/server.js

# Backend tests (need the emulators)
npx firebase-tools emulators:exec --only firestore,auth --project agrovia-ci "cd Backend && npm test"
```

No NASA key is needed for this: NASA POWER requires no account and ORNL access is handled by
Modelo through Earthdata Login. The only optional key is `ANTHROPIC_API_KEY` (together with
`VIA_POLISH_MODEL`) and it **only** enables VÍA rewriting; without it everything works the same.
