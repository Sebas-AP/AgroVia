# AGROVÍA Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the credential-free core of the AGROVÍA backend — types, Firestore structure, simulated
data providers, the indicators/rotation/economics engines, and the Express API over them — so
`POST /plots/:id/rotations` returns at least three explainable, provenance-tagged rotation strategies for
the Guadalupe Victoria demo plot, entirely on simulated data.

**Architecture:** Express + TypeScript API over a layered core: pure engines (indicators, rotation,
economics) that take plain data in and return plain data out, with no Firestore or HTTP dependency;
replaceable provider interfaces that currently return simulated data and will be swapped for real
NASA/SIAP/SNIIM callers in a follow-up plan; Firestore (via Admin SDK) as the only persistence layer, with
its collections, composite indexes, and security rules deployed through the already-linked Firebase MCP
(project `agrovia-48930`).

**Tech Stack:** Node.js, Express, TypeScript, Firebase Admin SDK, Firestore (+ Firestore Emulator for
rules tests via `@firebase/rules-unit-testing`), ESLint + Prettier, Vitest.

**Spec:** `Backend/docs/specs/2026-11-14-agrovia-backend-spec.md`

**Non-Goals (deferred to a follow-up plan):** real `worker-power`/`worker-prices`/`worker-gpm`/
`worker-static`/`worker-smap`/`worker-ndvi`, SMN station validation, dataset export
(`GET /internal/dataset/:plotId`), and the README — spec §15 steps 9–16. Those need NASA Earthdata
credentials not yet available and real data to validate against; building them now against only
simulated data would test nothing real. This plan delivers spec §15 steps 1–8, which the spec itself
scopes as credential-free and fully testable with simulated providers, and is where the challenge's core
requirement (≥3 explainable rotation strategies) is met.

## Global Constraints

- Stack: Node.js + Express + TypeScript. Lint: ESLint + Prettier. Tests: Vitest (per `Backend/AGENTS.md`).
- All code, comments, identifiers, commit messages: English only (root `AGENTS.md`; owner confirmed no
  Spanish domain names, 2026-11-14 — see spec header note).
- Firestore access from the backend: Admin SDK only. MCP is already linked to project `agrovia-48930` —
  owner has explicitly authorized creating/modifying collections, indexes, and rules through it.
- Secrets (NASA Earthdata, service keys, etc.) live in environment variables and in `.env.example` with no
  values. Never in the repo, an API response, or a Firestore document.
- Provenance is mandatory: every piece of external data carries `source`, `product`, `version`, `asOf`,
  `latencyDays`. Missing any of the five is an error, not incomplete data.
- Simulated data always carries `origin: "simulated"` and is exposed as such; never indistinguishable from
  real data.
- Every strategy score decomposes by criterion and weight — no black-box scoring.
- Every data source sits behind a replaceable interface (`ClimateProvider`, `SoilMoistureProvider`,
  `NdviProvider`, `SoilProvider`, `PricesProvider`, `CropCriteriaProvider`); simulated implementation now,
  real implementation later, without changing the engines that consume them.
- Every indicator document and every strategy stores `engineVersion` and `catalogVersion`; same inputs +
  same versions must reproduce the same output.
- A missing value is reported as a gap, never silently averaged or zero-filled (precipitation especially).
- Every agronomic criterion/threshold stores its source and is marked `documented` or `assumed`.
- The rotation engine and the economics engine are pure modules: no Express import, no Firestore import.
- `RotationStrategy[]` output: minimum 3 entries, the current strategy always included; never fabricate a
  strategy to hit the count — explain the shortfall in `infoGaps` instead.
- A division that would land on zero returns `null`, never `Infinity`; explain it in `infoGaps`.
- Every `/internal/*` route requires a service-key header, checked before any other work.
- API error shape is always `{ error: { code: string, message: string, detail?: unknown } }`.
- NASA POWER (future real worker) caps at 20 parameters per call — simulated `ClimateProvider` must expose
  the same parameter set so swapping in the real implementation later needs no interface change.

## Review Focus

- A plot with an empty `seasons` subcollection: the current-rotation strategy (A) must still be produced,
  built from the plot's `currentCrop` alone, with the missing history recorded in `infoGaps` — not omitted,
  not a thrown error. (Task 8)
- Two generated alternative strategies ending up with identical `sequence`: the generator must detect the
  collision and produce a different alternative instead of returning duplicates. (Task 8)
- A crop referenced by a plot's `seasons`/`business` data that has no entry in `cropCatalog`: the rotation
  engine must skip/flag it instead of throwing, and say so in `infoGaps`. (Task 8)
- A request to `/internal/*` with a missing or wrong service-key header: rejected with a stable error
  shape before touching Firestore or any engine — not just "validated like any other input." (Task 10)
- A `business/current` document with a negative or non-numeric cost field: rejected at the API boundary
  with a stable error, never silently coerced or passed into the economics formulas. (Task 10)

---

## Task 1: Project scaffolding

**Files:**
- Create: `Backend/package.json`, `Backend/tsconfig.json`, `Backend/.eslintrc.cjs`, `Backend/.prettierrc`,
  `Backend/vitest.config.ts`, `Backend/.env.example`, `Backend/.gitignore`
- Create: `Backend/src/app.ts`, `Backend/src/server.ts`, `Backend/src/routes/health.ts`
- Test: `Backend/tests/routes/health.test.ts`

**Interfaces:**
- Produces: `createApp(): express.Express` (from `src/app.ts`) — every later route task imports and extends
  this app factory instead of creating a second Express instance.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- health` (inside `Backend/`)
Expected: FAIL — `Cannot find module '../../src/app'` (nothing exists yet)

- [ ] **Step 3: Scaffold the project and implement `createApp(): express.Express` in `src/app.ts`**

`npm init`, install `express`, `typescript`, `vitest`, `supertest`, `eslint`, `prettier`, and their
`@types/*` as dev/prod dependencies as appropriate. `tsconfig.json` targets a current Node LTS, strict
mode on. `createApp()` builds and returns an `express()` instance with `express.json()` and a `/health`
route mounted from `src/routes/health.ts`, returning `{ status: 'ok' }`. `src/server.ts` calls `createApp()`
and listens on `process.env.PORT ?? 3000`. `.env.example` documents `PORT`, `FIREBASE_PROJECT_ID`,
`INTERNAL_SERVICE_KEY` with no values. `npm run lint`, `npm run build`, `npm test` scripts in
`package.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- health`
Expected: PASS (1/1)

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add Backend/package.json Backend/tsconfig.json Backend/.eslintrc.cjs Backend/.prettierrc \
  Backend/vitest.config.ts Backend/.env.example Backend/.gitignore Backend/src Backend/tests \
  Backend/package-lock.json
git commit -m "feat(backend): scaffold Express/TypeScript project with health check"
```

---

## Task 2: Core types and the provenance validator

**Files:**
- Create: `Backend/src/types/provenance.ts`, `Backend/src/types/business.ts`,
  `Backend/src/types/strategy.ts`, `Backend/src/types/firestoreDocs.ts`
- Create: `Backend/src/validators/provenanceValidator.ts`
- Test: `Backend/tests/validators/provenanceValidator.test.ts`

**Interfaces:**
- Consumes: nothing (first domain code).
- Produces: `Provenance`, `Evidence`, `DataOrigin`, `DataKind` (from `types/provenance.ts`);
  `BusinessInputs`, `EconomicResult`, `PriceScenario` (from `types/business.ts`); `RotationStrategy`
  (from `types/strategy.ts`) — exact shapes as given in spec §7. `validateProvenance(value: unknown):
  { ok: true; value: Provenance } | { ok: false; errors: string[] }` (from `validators/provenanceValidator.ts`)
  — every later task that persists or returns externally-sourced data calls this first.
  `PlotSnapshot`, `PlotPriorities`, `StrategyScores`, `PlotIndicators`, `CropCatalogEntry` (from
  `types/firestoreDocs.ts`, matching the `plots/{id}`, `plots/{id}/indicators/{YYYY-MM}`, and
  `cropCatalog/{id}` document shapes in spec §6) — type-only, no dedicated test (nothing here has
  runtime behavior beyond what `provenanceValidator` already exercises). `PlotPriorities` has exactly
  the 7 fields spec §6 gives a plot (`water`, `income`, `forage`, `nitrogen`, `erosion`, `organicMatter`,
  `market`, each 0–5); `StrategyScores` has exactly the 6 fields spec §9 scores a strategy on (`water`,
  `soil`, `climateRisk`, `pests`, `economy`, `market`). **These two key sets are not the same** — Task 8
  documents and implements the mapping between them.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { validateProvenance } from '../../src/validators/provenanceValidator'

describe('validateProvenance', () => {
  it('accepts a value with all five required fields', () => {
    const result = validateProvenance({
      source: 'NASA POWER', product: 'AG community daily', version: 'v9',
      asOf: '2026-11-01', latencyDays: 2, kind: 'historical', origin: 'simulated',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a value missing latencyDays', () => {
    const result = validateProvenance({
      source: 'NASA POWER', product: 'AG community daily', version: 'v9',
      asOf: '2026-11-01', kind: 'historical', origin: 'simulated',
    })
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- provenanceValidator`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the types and `validateProvenance`**

Define the three type files exactly as spec §7 (English names from the spec document, not the original
Spanish brief). `validateProvenance` checks, at minimum: `source`/`product`/`version` are non-empty
strings, `asOf` parses as an ISO date, `latencyDays` is a finite number ≥ 0, `kind` is one of the four
`DataKind` values, `origin` is one of the three `DataOrigin` values. On failure, `errors` names every
missing/invalid field (not just the first).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- provenanceValidator`
Expected: PASS (2/2)

- [ ] **Step 5: Write `types/firestoreDocs.ts`**

No test — pure type declarations, matching spec §6 field-for-field (English names). `PlotSnapshot`
includes `priorities: PlotPriorities`; `RotationStrategy.scores` (already typed in `types/strategy.ts`
above) uses `StrategyScores`.

- [ ] **Step 6: Commit**

```bash
git add Backend/src/types Backend/src/validators Backend/tests/validators
git commit -m "feat(backend): add core domain types and provenance validator"
```

---

## Task 3: Firestore structure — collections, cell-id utility, indexes, security rules

**Files:**
- Create: `Backend/firestore.rules`, `Backend/firestore.indexes.json`
- Create: `Backend/src/firestore/collections.ts`, `Backend/src/firestore/admin.ts`,
  `Backend/src/firestore/cellId.ts`
- Modify: `firebase.json` (repo root, currently `{}` — add the `firestore` key pointing at
  `Backend/firestore.rules`/`Backend/firestore.indexes.json`, and an `emulators.firestore` port, so
  `firebase deploy`/`firebase emulators:exec` have something to act on; this is the one file in this
  plan that lives outside `Backend/`, since the Firebase project config is necessarily repo-root-level)
- Test: `Backend/tests/firestore/cellId.test.ts`, `Backend/tests/firestore/rules.test.ts`

**Interfaces:**
- Consumes: `Provenance` type (Task 2) for doc-shape reference only.
- Produces: `COLLECTIONS` constant object with every top-level/subcollection path from spec §6 (e.g.
  `COLLECTIONS.plots`, `COLLECTIONS.cropCatalog`, `COLLECTIONS.cells`); `getAdminFirestore():
  Firestore` (lazy-initialized Admin SDK handle, from `firestore/admin.ts`); `computeCellId(lat: number,
  lon: number, product: 'power' | 'gpm' | 'smap' | 'modis'): string` (from `firestore/cellId.ts`) — Task 4
  (seeding) and Task 10 (routes) both call `computeCellId` and read `COLLECTIONS` instead of hardcoding
  path strings.

- [ ] **Step 1: Write the failing test for `computeCellId`**

```ts
import { describe, it, expect } from 'vitest'
import { computeCellId } from '../../src/firestore/cellId'

describe('computeCellId', () => {
  it('is deterministic for the same coordinate and product', () => {
    const a = computeCellId(24.4497, -104.1225, 'power')
    const b = computeCellId(24.4497, -104.1225, 'power')
    expect(a).toBe(b)
  })

  it('maps two nearby points inside the same POWER cell to the same id', () => {
    const a = computeCellId(24.4497, -104.1225, 'power')
    const b = computeCellId(24.4510, -104.1230, 'power')
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cellId`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `computeCellId`**

Round `lat`/`lon` down to the product's grid step before encoding into the id string (POWER: 0.5°×0.625°;
GPM: 0.1°; SMAP: ~0.08° ≈ 9 km; MODIS: ~0.00225° ≈ 250 m — use the resolutions given in spec §5.1). Encode
as `"<product>:<roundedLat>:<roundedLon>"`. Document the exact rounding formula in a code comment, per
spec §6's "document the formula" requirement.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cellId`
Expected: PASS (2/2)

- [ ] **Step 5: Write `firestore.rules`, `firestore.indexes.json`, and wire them into root `firebase.json`**

Rules exactly as spec §6 "Security rules": owner-only read/write on `plots` and its subcollections;
authenticated-read/admin-write-only on `cropCatalog`, `cells`, `prices`, `validations`; owner-read/
server-write-only on `strategies`; no client write to provenance fields anywhere. Indexes exactly as spec
§6 "Composite indexes to create" (4 entries). Add `COLLECTIONS` (string constants) and `getAdminFirestore`
(reads `FIREBASE_PROJECT_ID` from env, uses application-default credentials since the MCP/CLI already
authenticated this machine). Update the repo-root `firebase.json` from `{}` to:
```json
{
  "firestore": { "rules": "Backend/firestore.rules", "indexes": "Backend/firestore.indexes.json" },
  "emulators": { "firestore": { "port": 8080 } }
}
```
Run every `firebase` command below **from the repo root** (one level up from `Backend/`), since that's
where `firebase.json`/`.firebaserc` live — the paths above are relative to it.

- [ ] **Step 6: Write the failing rules test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'

let testEnv: import('@firebase/rules-unit-testing').RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'agrovia-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => testEnv.cleanup())

describe('plots security rules', () => {
  it('lets the owner read their own plot', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-1').firestore()
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      ctx.firestore().doc('plots/plot-1').set({ ownerUid: 'owner-1' }))
    await assertSucceeds(ownerDb.doc('plots/plot-1').get())
  })

  it('blocks a different authenticated user from reading the plot', async () => {
    const otherDb = testEnv.authenticatedContext('owner-2').firestore()
    await assertFails(otherDb.doc('plots/plot-1').get())
  })

  it('blocks a client from writing cropCatalog', async () => {
    const db = testEnv.authenticatedContext('owner-1').firestore()
    await assertFails(db.doc('cropCatalog/corn').set({ name: 'Corn' }))
  })
})
```

- [ ] **Step 7: Run test to verify it fails, then run the Firestore emulator and verify it passes**

From the repo root (one level up from `Backend/`, where `firebase.json` lives):
Run: `firebase emulators:exec --only firestore "npm --prefix Backend test -- rules"`
Expected first (before `firestore.rules` is correct): FAIL. Expected once correct: PASS (3/3). The
`readFileSync('firestore.rules', 'utf8')` call in the test resolves relative to `Backend/`, which is
where `npm --prefix Backend` runs the actual test process's cwd.

- [ ] **Step 8: Deploy the rules and indexes to the linked project**

From the repo root:
Run: `firebase deploy --only firestore:rules,firestore:indexes --project agrovia-48930`
Expected: deploy succeeds (owner has already authorized writing to this project via the Firebase MCP)

- [ ] **Step 9: Commit**

```bash
git add Backend/firestore.rules Backend/firestore.indexes.json Backend/src/firestore Backend/tests/firestore
git commit -m "feat(backend): add Firestore collections, cell-id util, indexes, and security rules"
```

---

## Task 4: Seed data — crop catalog and the Guadalupe Victoria demo plot

**Files:**
- Create: `Backend/src/seed/cropCatalog.seed.ts`, `Backend/src/seed/demoPlot.seed.ts`,
  `Backend/src/seed/runSeed.ts`
- Test: `Backend/tests/seed/demoPlot.seed.test.ts`

**Interfaces:**
- Consumes: `COLLECTIONS`, `getAdminFirestore`, `computeCellId` (Task 3); `DataOrigin` (Task 2).
- Produces: `seedCropCatalog(db: Firestore): Promise<void>`, `seedDemoPlot(db: Firestore): Promise<void>`
  — Task 8 (rotation engine) and Task 10 (routes) tests run against the data these two functions write,
  as the project's one canonical fixture.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { seedDemoPlot } from '../../src/seed/demoPlot.seed'

describe('seedDemoPlot', () => {
  it('writes a rainfed plot in Guadalupe Victoria with two seasons of history', async () => {
    const testEnv = await initializeTestEnvironment({ projectId: 'agrovia-seed-test' })
    const db = testEnv.unauthenticatedContext().firestore() as unknown as FirebaseFirestore.Firestore
    await seedDemoPlot(db)
    const plot = await db.doc('plots/demo-guadalupe-victoria').get()
    expect(plot.data()).toMatchObject({
      center: { lat: 24.4497, lon: -104.1225 }, areaHa: 9.6, mode: 'rainfed', origin: 'demo',
    })
    const seasons = await db.collection('plots/demo-guadalupe-victoria/seasons').get()
    expect(seasons.size).toBe(2)
    await testEnv.cleanup()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From the repo root: Run: `firebase emulators:exec --only firestore "npm --prefix Backend test -- demoPlot"`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the seed functions**

`seedCropCatalog` writes the four crops from spec §6 (grain corn, beans, forage oats, forage sorghum) with
a `source`/`reference` and `criterionType: 'documented' | 'assumed'` each — mark whatever you cannot find a
real INIFAP/FAO/GAEZ figure for as `'assumed'`. `seedDemoPlot` writes `plots/demo-guadalupe-victoria`
exactly as spec §6 "Seed data to create" (center `24.4497, -104.1225`, ~2,000 m elevation, `mode:
'rainfed'`, `areaHa: 9.6`, `origin: 'demo'`, cell ids from `computeCellId`) plus two `seasons` documents
(`{ year: <last year>, crop: 'corn', origin: 'demo' }` and `{ year: <two years ago>, crop: 'beans', origin:
'demo' }`). Both functions are idempotent (use fixed doc ids, `set` not `add`). `runSeed.ts` is a small CLI
entry point (`npm run seed`) that calls both against the real project.

- [ ] **Step 4: Run test to verify it passes**

From the repo root: Run: `firebase emulators:exec --only firestore "npm --prefix Backend test -- demoPlot"`
Expected: PASS (1/1)

- [ ] **Step 5: Run the seed against the real project**

Run: `npm --prefix Backend run seed`
Expected: completes without error; `cropCatalog` has 4 documents and
`plots/demo-guadalupe-victoria` exists with 2 `seasons` documents (owner has already authorized this via
the Firebase MCP link)

- [ ] **Step 6: Commit**

```bash
git add Backend/src/seed Backend/tests/seed Backend/package.json
git commit -m "feat(backend): seed crop catalog and Guadalupe Victoria demo plot"
```

---

## Task 5: Provider interfaces and simulated implementations

**Files:**
- Create: `Backend/src/providers/ClimateProvider.ts`, `Backend/src/providers/SoilMoistureProvider.ts`,
  `Backend/src/providers/NdviProvider.ts`, `Backend/src/providers/SoilProvider.ts`,
  `Backend/src/providers/PricesProvider.ts`, `Backend/src/providers/CropCriteriaProvider.ts`
- Test: `Backend/tests/providers/simulatedProviders.test.ts`

**Interfaces:**
- Consumes: `Provenance` (Task 2).
- Produces (one interface + one `Simulated*` class per provider; later tasks depend on these exact
  method signatures):
  - `ClimateProvider.getDailySeries(cellId: string, from: string, to: string): Promise<{ date: string;
    values: Record<string, number>; provenance: Provenance }[]>` — params limited to the 11 named in spec
    §5.1 (`T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `PRECTOTCORR`, `GWETTOP`, `GWETROOT`, `GWETPROF`, `TS`,
    `ALLSKY_SFC_SW_DWN`, `WS2M`).
  - `SoilMoistureProvider.getDailySeries(cellId: string, from: string, to: string): Promise<{ date:
    string; smSurface: number; smRootzone: number; smRootzonePctl: number | null; soilTempLayer1: number;
    provenance: Provenance }[]>`
  - `NdviProvider.getSeries(cellId: string, from: string, to: string): Promise<{ date: string; ndvi:
    number; evi: number; qualityOk: boolean; provenance: Provenance }[]>`
  - `SoilProvider.getStaticProfile(lat: number, lon: number): Promise<{ slopeDegrees: number;
    sandPct: number; siltPct: number; clayPct: number; organicCarbon: number; pH: number; cec: number;
    waterRetentionMm: number; provenance: Provenance }>`
  - `PricesProvider.getSnapshot(cropId: string, municipality: string, asOfDate: string): Promise<{
    ruralAvgPriceKg: number; wholesalePriceKg: number; guaranteedPriceTon: number | null; yieldTonHa:
    number; provenance: Provenance }>`
  - `CropCriteriaProvider.getCriteria(cropId: string): Promise<CropCatalogEntry | null>` (reads from
    `cropCatalog`, seeded in Task 4 — this is the one provider backed by Firestore rather than a future
    external API, since the catalog *is* the source of truth).

- [ ] **Step 1: Write the failing tests (one per provider, simulated behavior)**

```ts
import { describe, it, expect } from 'vitest'
import { SimulatedClimateProvider } from '../../src/providers/ClimateProvider'

describe('SimulatedClimateProvider', () => {
  it('returns one entry per day in range, marked simulated', async () => {
    const provider = new SimulatedClimateProvider()
    const series = await provider.getDailySeries('power:24.25:-104.3125', '2026-01-01', '2026-01-03')
    expect(series).toHaveLength(3)
    expect(series[0].provenance.origin).toBe('simulated')
    expect(Object.keys(series[0].values).sort()).toEqual(
      ['ALLSKY_SFC_SW_DWN', 'GWETPROF', 'GWETROOT', 'GWETTOP', 'PRECTOTCORR', 'RH2M', 'T2M', 'T2M_MAX',
       'T2M_MIN', 'TS', 'WS2M'].sort(),
    )
  })
})
```

Repeat the same shape (deterministic by seeding on `cellId`/`cropId`, correct field set, `origin:
'simulated'` in every `provenance`) for the other five providers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- simulatedProviders`
Expected: FAIL — modules do not exist

- [ ] **Step 3: Implement each interface and its `Simulated*` class**

Each `Simulated*` class generates deterministic values from a seeded PRNG keyed on its input id (same
`cellId`/`cropId` → same numbers every run, so engine tests built on top of these are reproducible) and
tags every record with `provenance.origin: 'simulated'` and a plausible `source`/`product` (e.g. `source:
'NASA POWER (simulated)'`). `CropCriteriaProvider` is the one real-Firestore-backed implementation: it
reads `cropCatalog/{cropId}` via `getAdminFirestore()` (Task 3) and returns `null` if the doc doesn't
exist — no simulated fallback, since the catalog is always present once Task 4 has run.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- simulatedProviders`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/providers Backend/tests/providers
git commit -m "feat(backend): add provider interfaces with simulated implementations"
```

---

## Task 6: Indicators engine — per-metric calculations

**Files:**
- Create: `Backend/src/engines/indicators/waterBalance.ts`, `Backend/src/engines/indicators/rainMetrics.ts`
  (extreme rain + dry spell), `Backend/src/engines/indicators/moistureAnomaly.ts`,
  `Backend/src/engines/indicators/soilTemperature.ts`, `Backend/src/engines/indicators/bareSoil.ts`,
  `Backend/src/engines/indicators/growingDegreeDays.ts`
- Test: one test file per calculation file, same basename under `Backend/tests/engines/indicators/`

**Interfaces:**
- Consumes: the per-day record shapes produced by Task 5's providers (daily climate values, soil moisture,
  NDVI).
- Produces (consumed by Task 7's `computeIndicators`):
  - `computeWaterBalance(days: { date: string; rainMm: number; evapotranspirationMm: number }[],
    windowDays: 5 | 10 | 15 | 30): number | null` — `null` only when the window has no data at all.
  - `computeRainMetrics(days: { date: string; rainMm: number }[], historicalP95Mm: number): {
    rainAccumMm: number; rainyDays: number; extremeRainDays: number; maxDrySpellDays: number }`
  - `computeMoistureAnomaly(days: { date: string; smRootzonePctl: number | null }[]): number | null` —
    falls back to `null` (never a fabricated percentile) when every entry is `null`.
  - `computeSoilTemperatureAverages(days: { date: string; soilTempC: number }[]): { avg7d: number | null;
    avg10d: number | null }`
  - `isBareSoil(ndvi: number, qualityOk: boolean, ndviCoverThreshold: number): boolean | null` — `null`
    when `qualityOk` is `false` (quality band respected, per spec §8).
  - `computeGrowingDegreeDaysAccum(days: { date: string; tempAvgC: number }[], baseTempC: number): number`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { computeWaterBalance } from '../../../src/engines/indicators/waterBalance'

describe('computeWaterBalance', () => {
  it('sums rain minus evapotranspiration over the trailing window, including today', () => {
    const days = [
      { date: '2026-01-01', rainMm: 5, evapotranspirationMm: 2 },
      { date: '2026-01-02', rainMm: 0, evapotranspirationMm: 3 },
      { date: '2026-01-03', rainMm: 10, evapotranspirationMm: 1 },
    ]
    expect(computeWaterBalance(days, 5)).toBe((5 - 2) + (0 - 3) + (10 - 1))
  })
})
```

Add one such test per function above, including: `computeRainMetrics` using a historical P95 rather than a
fixed threshold for `extremeRainDays`, and a dry-spell count across a run of sub-1mm days;
`computeMoistureAnomaly` returning `null` on all-null input (never a fabricated number — ties to spec §8's
SMAP-first-else-climatology-percentile rule and the "never silently fill" global constraint);
`isBareSoil` returning `null` when `qualityOk` is `false`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- engines/indicators`
Expected: FAIL — modules do not exist

- [ ] **Step 3: Implement each function**

Pure functions, no I/O. `computeWaterBalance` sums `rainMm - evapotranspirationMm` over the last
`windowDays` entries (inclusive of the current day) found in `days`; returns `null` if `days` is empty.
`computeRainMetrics`'s `extremeRainDays` counts days where `rainMm > historicalP95Mm` (the percentile is
passed in, not computed here — that's Task 7's harmonization job, since it needs the full cell history).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- engines/indicators`
Expected: PASS (6/6 — one assertion group per function, counts depend on exact test cases written)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/engines/indicators Backend/tests/engines/indicators
git commit -m "feat(backend): add per-metric indicator calculations"
```

---

## Task 7: Indicators engine — harmonization, imputation, and composition

**Files:**
- Create: `Backend/src/engines/indicators/harmonize.ts`, `Backend/src/engines/indicators/imputation.ts`,
  `Backend/src/engines/indicators/index.ts`
- Test: `Backend/tests/engines/indicators/harmonize.test.ts`,
  `Backend/tests/engines/indicators/imputation.test.ts`,
  `Backend/tests/engines/indicators/index.test.ts`

**Interfaces:**
- Consumes: all six functions from Task 6; provider record shapes from Task 5.
- Produces: `resampleToMonthly<T extends { date: string }>(daily: T[], aggregate: (rows: T[]) => Omit<T,
  'date'>): { month: string; data: Omit<T, 'date'> }[]`; `imputeGaps(days: { date: string; value: number |
  null }[], maxGapDays: number): { date: string; value: number | null; imputed: boolean }[]` (never called
  on precipitation — enforced by the caller in `computeIndicators`, not by this function, which is
  source-agnostic); `computeIndicators(input: { plotId: string; month: string; climate: ...; soilMoisture:
  ...; ndvi: ...; cropBaseTempC: number }): PlotIndicators` (the full `plots/{id}/indicators/{YYYY-MM}`
  document shape from spec §6, including `sources`, `asOf`, `engineVersion`) — Task 10's indicators route
  calls only this function.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { imputeGaps } from '../../../src/engines/indicators/imputation'

describe('imputeGaps', () => {
  it('fills a gap of up to maxGapDays by linear interpolation and marks it imputed', () => {
    const days = [
      { date: '2026-01-01', value: 10 }, { date: '2026-01-02', value: null },
      { date: '2026-01-03', value: 20 },
    ]
    const result = imputeGaps(days, 3)
    expect(result[1]).toEqual({ date: '2026-01-02', value: 15, imputed: true })
  })

  it('leaves a gap longer than maxGapDays as null, not imputed', () => {
    const days = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: null }, { date: '2026-01-03', value: null },
      { date: '2026-01-04', value: null }, { date: '2026-01-05', value: null },
      { date: '2026-01-06', value: 20 },
    ]
    const result = imputeGaps(days, 3)
    expect(result.slice(1, 5).every((d) => d.value === null && !d.imputed)).toBe(true)
  })
})
```

Add a `computeIndicators` test asserting: precipitation gaps are never passed through `imputeGaps`
(assert the returned document's rain figures are unaffected by a precipitation `null`, i.e. the gap stays
a gap, not a filled value); and the returned document includes `engineVersion` and a non-empty `sources`
array built from every input's `provenance`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- engines/indicators/harmonize engines/indicators/imputation engines/indicators/index`
Expected: FAIL — modules do not exist

- [ ] **Step 3: Implement `resampleToMonthly`, `imputeGaps`, and `computeIndicators`**

`resampleToMonthly` groups by the `YYYY-MM` prefix of `date` and calls `aggregate` per group — this is the
one documented resampling step the spec requires (§8 "document the resampling in PLAN.md and in a module
comment"); add that comment here, and mirror it in this plan's "Risks" note below. `imputeGaps` does
linear interpolation between the two nearest non-null neighbors when the gap is `<= maxGapDays`, otherwise
leaves `null`/`imputed: false`. `computeIndicators` wires Task 6's six functions and these two helpers
together: it calls `imputeGaps` with `maxGapDays: 3` for temperature/evapotranspiration series only, never
for the rain series, then calls each Task 6 function, then `resampleToMonthly` to produce the final
document, filling `sources` from every input's `provenance` and stamping `engineVersion` from a
`package.json`-read or hardcoded constant (e.g. `'1.0.0'`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- engines/indicators`
Expected: PASS (all indicator-engine tests from Task 6 and Task 7 green)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/engines/indicators Backend/tests/engines/indicators
git commit -m "feat(backend): add harmonization, imputation, and the composed indicators engine"
```

---

## Task 8: Rotation engine

**Files:**
- Create: `Backend/src/engines/rotation/filters.ts`, `Backend/src/engines/rotation/scoring.ts`,
  `Backend/src/engines/rotation/index.ts`
- Test: `Backend/tests/engines/rotation/filters.test.ts`, `Backend/tests/engines/rotation/scoring.test.ts`,
  `Backend/tests/engines/rotation/index.test.ts`

**Interfaces:**
- Consumes: `RotationStrategy`, `Evidence`, `PlotSnapshot`, `PlotPriorities`, `StrategyScores`,
  `PlotIndicators`, `CropCatalogEntry` (Task 2); the return type of `SoilProvider.getStaticProfile`
  (Task 5, used directly as the static-profile shape — no separate type needed).
- Produces: `generateStrategies(input: { plot: PlotSnapshot; staticProfile:
  Awaited<ReturnType<SoilProvider['getStaticProfile']>>; seasons: { year: number; crop: string }[];
  priorities: PlotPriorities; indicators: PlotIndicators; catalog: CropCatalogEntry[] }):
  RotationStrategy[]` — Task 10's rotations route calls only this function (plus Task 9's economics
  engine to fill each strategy's `economics` field).

**Priorities → scores mapping (spec ambiguity, resolved here):** a plot's 7 `PlotPriorities` fields
(`water`, `income`, `forage`, `nitrogen`, `erosion`, `organicMatter`, `market`) do not name-match a
strategy's 6 `StrategyScores` fields (`water`, `soil`, `climateRisk`, `pests`, `economy`, `market`) — the
spec never states the weight mapping between them. `scoring.ts` resolves it as:
`water` weight ← `priorities.water`; `soil` weight ← average of `priorities.nitrogen`,
`priorities.organicMatter`, `priorities.erosion` (the three inputs spec §9 names for the `soil` score);
`economy` weight ← `priorities.income`; `market` weight ← `priorities.market`; `climateRisk` and `pests`
weight ← a fixed default of `1` (no priority field names either, per spec §6's `priorities` list — mark
this default with an `// ASSUMPTION:` comment). `priorities.forage` is not consumed by any score; mark
that with its own `// ASSUMPTION:` comment too (nothing in spec §9 reads it, and forage relevance is
better captured through crop choice itself in a rotation that includes forage crops).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { generateStrategies } from '../../../src/engines/rotation'
import { demoRotationInput } from '../../fixtures/demoRotationInput'

describe('generateStrategies', () => {
  it('always returns at least 3 strategies including the current one', () => {
    const strategies = generateStrategies(demoRotationInput())
    expect(strategies.length).toBeGreaterThanOrEqual(3)
    expect(strategies.some((s) => s.type === 'current')).toBe(true)
  })

  it('builds the current strategy from seasons history when present', () => {
    const strategies = generateStrategies(demoRotationInput())
    const current = strategies.find((s) => s.type === 'current')!
    expect(current.sequence.map((s) => s.crop)).toEqual(['beans', 'corn'])
  })

  it('falls back to the plot currentCrop and flags the gap when seasons is empty', () => {
    const input = demoRotationInput({ seasons: [] })
    const strategies = generateStrategies(input)
    const current = strategies.find((s) => s.type === 'current')!
    expect(current.infoGaps.length).toBeGreaterThan(0)
  })

  it('never returns two alternatives with the same sequence', () => {
    const strategies = generateStrategies(demoRotationInput())
    const sequenceKeys = strategies.map((s) => JSON.stringify(s.sequence))
    expect(new Set(sequenceKeys).size).toBe(sequenceKeys.length)
  })

  it('skips a crop missing from the catalog instead of throwing, and records the gap', () => {
    const input = demoRotationInput({ seasons: [{ year: 2025, crop: 'unknown-crop' }] })
    expect(() => generateStrategies(input)).not.toThrow()
    const current = generateStrategies(input).find((s) => s.type === 'current')!
    expect(current.infoGaps.join(' ')).toMatch(/unknown-crop/)
  })

  it('raising the water priority weight raises the score of low-water strategies', () => {
    const lowWaterPriority = generateStrategies(demoRotationInput({ priorities: { water: 5 } }))
    const highWaterPriority = generateStrategies(demoRotationInput({ priorities: { water: 0 } }))
    const lowWaterStrategy = (s: typeof lowWaterPriority) => s.find((x) => x.id === 'alt-low-water')!
    expect(lowWaterStrategy(lowWaterPriority).scores.water)
      .toBeGreaterThan(lowWaterStrategy(highWaterPriority).scores.water)
  })
})
```

Create `Backend/tests/fixtures/demoRotationInput.ts` as a small builder returning a complete, valid
`generateStrategies` input (based on the seeded demo plot's data shape), with an optional partial override
argument so each test above can tweak just the field it's testing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- engines/rotation`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `filters.ts`, `scoring.ts`, and `index.ts`**

`filters.ts`: suitability filtering (thermal zone/water against catalog entry, declared water
availability, available equipment, planting window, same-crop-repeat penalty) — returns the subset of
`catalog` compatible with the plot for a given rotation slot. `scoring.ts`: the six 0–100 per-criterion
scores from spec §9, each a pure function of `(catalogEntry, indicators, staticProfile)`, combined into
`totalScore` using the priorities→weights mapping documented above in this task's Interfaces block.
`index.ts`'s `generateStrategies`: builds strategy A from
`seasons` (or falls back to `plot.currentCrop` with an `infoGaps` entry when `seasons` is empty), generates
B/C/D from `filters`-compatible catalog entries scored by `scoring`, retries generation when two
alternatives collide on `sequence`, and appends an `infoGaps` entry (never a thrown error) for any crop in
`seasons`/catalog lookups that comes back `null`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- engines/rotation`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/engines/rotation Backend/tests/engines/rotation Backend/tests/fixtures
git commit -m "feat(backend): add the rotation engine"
```

---

## Task 9: Economics engine

**Files:**
- Create: `Backend/src/engines/economics/index.ts`
- Test: `Backend/tests/engines/economics/index.test.ts`

**Interfaces:**
- Consumes: `BusinessInputs`, `EconomicResult`, `PriceScenario` (Task 2).
- Produces: `computeEconomicResult(inputs: BusinessInputs): EconomicResult`;
  `computeScenarioPrices(crop: { ruralAvgPriceKg: number; wholesalePriceKg: number; guaranteedPriceTon:
  number | null; areaHa: number }, priceHistory: { priceTon: number }[]): Record<PriceScenario, number |
  null>` — Task 10's economics route and the rotation engine's `economics` field both call these two
  functions; neither touches Firestore.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { computeEconomicResult, computeScenarioPrices } from '../../../src/engines/economics'

describe('computeEconomicResult', () => {
  const base = { crop: 'corn', area: 2, seed: 100, fertilizer: 200, water: 50, labor: 300,
    machinery: 150, transport: 80, other: 20, yieldTonHa: 3, priceTon: 4000 }

  it('computes investment, production, revenue, and profit per the spec formulas', () => {
    const result = computeEconomicResult(base)
    expect(result.investment).toBe(100 + 200 + 50 + 300 + 150 + 80 + 20)
    expect(result.production).toBe(2 * 3)
    expect(result.revenue).toBe(result.production * 4000)
    expect(result.profit).toBe(result.revenue - result.investment)
  })

  it('raises profit by exactly the removed cost when seed drops to zero', () => {
    const withSeed = computeEconomicResult(base)
    const withoutSeed = computeEconomicResult({ ...base, seed: 0 })
    expect(withoutSeed.profit - withSeed.profit).toBe(base.seed)
  })

  it('returns null, never Infinity, when production is zero', () => {
    const result = computeEconomicResult({ ...base, yieldTonHa: 0 })
    expect(result.costPerTon).toBeNull()
    expect(result.breakEvenYield).toBeNull()
  })
})

describe('computeScenarioPrices', () => {
  it('drops the guaranteed-price floor once area exceeds the 5 ha small-producer limit', () => {
    const under5ha = computeScenarioPrices(
      { ruralAvgPriceKg: 5, wholesalePriceKg: 6, guaranteedPriceTon: 4500, areaHa: 4 },
      [{ priceTon: 4000 }, { priceTon: 4200 }],
    )
    const over5ha = computeScenarioPrices(
      { ruralAvgPriceKg: 5, wholesalePriceKg: 6, guaranteedPriceTon: 4500, areaHa: 6 },
      [{ priceTon: 4000 }, { priceTon: 4200 }],
    )
    expect(under5ha.floor).toBe(4500)
    expect(over5ha.floor).not.toBe(4500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- engines/economics`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `computeEconomicResult` and `computeScenarioPrices`**

Exactly the formulas in spec §10. Every division (`costPerHa`, `costPerTon`, `marginPct`, `breakEvenTon`,
`breakEvenYield`) returns `null` instead of `Infinity`/`NaN` when its denominator is `0`.
`computeScenarioPrices`'s `floor` is `guaranteedPriceTon` only when `areaHa <= 5`; otherwise it's the
lowest `priceTon` in `priceHistory`. `optimistic` applies a parametrizable discount to `wholesalePriceKg`
(accept a `discountPct` parameter with a documented default, e.g. `0.1`). `drop` is the low percentile
(e.g. 10th) of `priceHistory`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- engines/economics`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/engines/economics Backend/tests/engines/economics
git commit -m "feat(backend): add the economics engine"
```

---

## Task 10: Express routes and middleware

**Files:**
- Create: `Backend/src/middleware/serviceKeyAuth.ts`, `Backend/src/middleware/errorHandler.ts`
- Create: `Backend/src/routes/plots.ts`, `Backend/src/routes/catalog.ts`, `Backend/src/routes/prices.ts`,
  `Backend/src/routes/internal.ts`
- Modify: `Backend/src/app.ts` (mount the new routers)
- Test: `Backend/tests/routes/plots.test.ts`, `Backend/tests/routes/internal.test.ts`

**Interfaces:**
- Consumes: `createApp` (Task 1); `computeIndicators` (Task 7); `generateStrategies` (Task 8);
  `computeEconomicResult`/`computeScenarioPrices` (Task 9); `getAdminFirestore`/`COLLECTIONS` (Task 3);
  the six providers (Task 5); the seeded demo plot (Task 4, for the integration-style tests below).
- Produces: the routes from spec §13 that this plan covers — `GET /plots/:id/indicators`,
  `POST /plots/:id/rotations`, `GET /plots/:id/rotations`, `POST /plots/:id/economics`,
  `GET /catalog/crops`, `GET /prices/:crop`, `POST /internal/ingest/:source`. (`GET
  /internal/validation/smn` and `GET /internal/dataset/:plotId` are out of scope — see Non-Goals; a
  follow-up plan adds them once real data exists.)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app'

describe('POST /plots/:id/rotations', () => {
  it('returns at least 3 strategies for the demo plot, the current one included', async () => {
    const res = await request(createApp()).post('/plots/demo-guadalupe-victoria/rotations').send({})
    expect(res.status).toBe(200)
    expect(res.body.strategies.length).toBeGreaterThanOrEqual(3)
    expect(res.body.strategies.some((s: { type: string }) => s.type === 'current')).toBe(true)
  })

  it('returns a stable error shape for an unknown plot', async () => {
    const res = await request(createApp()).post('/plots/does-not-exist/rotations').send({})
    expect(res.status).toBe(404)
    expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) })
  })
})

describe('POST /internal/ingest/:source', () => {
  it('rejects a request with no service-key header before touching Firestore', async () => {
    const res = await request(createApp()).post('/internal/ingest/power').send({})
    expect(res.status).toBe(401)
  })

  it('rejects a request with the wrong service-key header', async () => {
    const res = await request(createApp()).post('/internal/ingest/power')
      .set('x-service-key', 'wrong').send({})
    expect(res.status).toBe(401)
  })
})
```

Add a `POST /plots/:id/economics` test asserting a negative `seed` cost in the request body is rejected
with a stable error and never reaches `computeEconomicResult` (Review Focus item 5), and a
`GET /plots/:id/rotations` test asserting it returns the last `POST`-generated strategies rather than
regenerating them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- routes`
Expected: FAIL — routers/middleware do not exist

- [ ] **Step 3: Implement the middleware and routers**

`serviceKeyAuth`: compares the `x-service-key` header against `process.env.INTERNAL_SERVICE_KEY`,
responding `401` with the stable error shape before calling `next()`; mounted on every `/internal/*`
route and nothing else. `errorHandler`: an Express error-handling middleware mounted last, mapping thrown
errors to `{ error: { code, message, detail? } }` with the right HTTP status (`404` for not-found,
`400` for validation, `401` for auth, `500` otherwise). `routes/plots.ts` wires the plot's Firestore
document + Task 5 providers (by its `powerCellId`/`gpmCellId`/`smapCellId`) into `computeIndicators`
for the `GET .../indicators` route, and into `generateStrategies` + `computeEconomicResult` for the
rotations/economics routes, persisting generated strategies to `strategies/` (Task 3's rules already
restrict that collection to server-only writes, which this route satisfies since it writes via the Admin
SDK). Validate every request body (e.g. with a small hand-written check or a minimal schema library
already in `package.json`) before it reaches an engine — explicitly covering negative/non-numeric
`BusinessInputs` fields (Review Focus item 5).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- routes`
Expected: PASS (all route tests)

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, every test from Tasks 1–10 green

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add Backend/src/middleware Backend/src/routes Backend/src/app.ts Backend/tests/routes
git commit -m "feat(backend): add Express routes and middleware over the engines"
```

---

## Risks / Notes for the implementer

- **Resampling to monthly** (spec §8's explicit documentation requirement): implemented in
  `src/engines/indicators/harmonize.ts`'s `resampleToMonthly`, grouping daily/sub-daily provider records
  by the month prefix of their `date` field and applying a caller-supplied `aggregate` function per metric
  (e.g. sum for rain, mean for temperature). Document this again as a code comment on `resampleToMonthly`
  itself — the spec requires both.
- The Firestore emulator (`firebase emulators:exec --only firestore ...`) needs a JVM; this machine has
  one (OpenJDK 25 at `/usr/bin/java`), confirmed working during planning.
- Task 3's rules deploy and Task 4's seed run write to the real, already-linked `agrovia-48930` project —
  the owner has explicitly pre-authorized this (spec §3, §6). No further confirmation needed before those
  two steps.
- `GET /internal/validation/smn` and `GET /internal/dataset/:plotId` are real routes in the final spec
  (§13, §16) but depend on data this plan doesn't produce (SMN station readings, real indicator history).
  They belong in the follow-up "real workers" plan — flagging this now so nothing from §13/§16 is silently
  dropped.
