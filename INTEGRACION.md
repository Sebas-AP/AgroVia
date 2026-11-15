# AGROVÍA — Integración de Backend, Modelo y AppMovil

Rama: `integracion/fase-1`. Este documento se escribió **antes** de tocar código, por instrucción explícita del encargo.

## 0. Bloqueo de frontend — léase primero

Se buscó el código fuente del bundle de React (`AppMovil/.../app/src/main/assets/www/assets/index-B_8LPfCL.js`, 294 KB, minificado) en todo el repositorio: ningún `package.json` con React, ninguna carpeta con `.tsx`/`.jsx`. **El fuente no está en el repo.**

Por la regla 7 ("no reescribas el frontend") y la sección 3 del encargo: no se va a tocar `index-B_8LPfCL.js`. La app queda funcionalmente como está — sirviendo datos de demostración, `connected: false` — hasta que el equipo de frontend reconstruya el bundle desde el proyecto Figma Make original y lo reemplace en `assets/www/`.

Lo que sí se entrega en esta fase para que ese equipo pueda avanzar sin esperar a la app:
- Backend y Modelo integrados y verificables por HTTP de forma independiente.
- `docs/ejemplos-api.http` con peticiones de ejemplo contra ambos servicios.
- Una guía para el equipo de frontend (sección 10 de este plan) con la URL base, las rutas, la forma de las respuestas y qué reemplazar en su capa de `services/`.

Los defectos (k), (l), (m), (n) de AppMovil (sección 4.3 del encargo) sí se corrigen — son del lado nativo (Gradle/Kotlin/CI/manifest), no del bundle React, y no requieren el fuente.

## 1. Hallazgo adicional no listado en el encargo: AppMovil cambió de Flutter a Android nativo sin actualizar la documentación

El `AGENTS.md` raíz y el harness de desarrollo (`docs/superpowers/plans/2026-11-14-agrovia-dev-harness.md`) decidieron explícitamente que `AppMovil` sería un proyecto **Flutter** (`pubspec.yaml`, `flutter analyze`, `flutter test`). `AppMovil/AGENTS.md` todavía dice "Stack: Flutter/Dart".

Pero el proyecto real que existe hoy es **Android nativo (Kotlin + Gradle) con un WebView** que carga un bundle de React exportado de Figma Make — no hay Flutter en ninguna parte del repo. Esto es la causa raíz de que el defecto (m) pasara desapercibido: el CI de GitHub Actions y `scripts/lint-folder.sh` siguen hablando de Flutter/`pubspec.yaml`, así que nunca ejecutaron nada contra el código Android real.

Al corregir (k)/(l)/(m)/(n) también se actualiza `AppMovil/AGENTS.md` (y la mención en el `AGENTS.md` raíz) para que digan lo que el proyecto realmente es: Android nativo (Kotlin/Gradle) con WebView. Es la corrección mínima que hace consistente la documentación con el código; no se reescribe nada más de las reglas del harness.

## 2. Hallazgo adicional: la carpeta del proyecto Android se movió sin que git lo supiera

`git status` muestra `AppMovil/AgroViaAndroid/agrovia-figma-android-/` íntegramente borrado del working tree y `AppMovil/AgroViaApp/agrovia-figma-android-/` como nuevo, sin seguimiento — mismo contenido, nueva ubicación. Es trabajo en progreso ya presente en el árbol de trabajo, no algo que se deba descartar. Esta integración trabaja sobre la ubicación nueva (`AppMovil/AgroViaApp/agrovia-figma-android-/`) y registra el movimiento como un `git mv` lógico en el primer commit de AppMovil.

## 3. Diagnóstico de los defectos del encargo

### Backend

| # | Confirmado | Nota |
|---|---|---|
| (a) ninguna ruta verifica identidad | **Sí** | `Backend/src/app.ts:9-14` ya lo documenta en un comentario explícito. Las reglas de Firestore (`firestore.rules`) son owner-only y correctas; el Admin SDK las evade. |
| (b) `avgMargin` guarda % no dinero | **Sí** | `routes/plots.ts:211` asigna `marginPct` (ya es `%`) a un campo llamado `avgMargin`. Se resuelve como recomienda el encargo: `avgMarginPct` + `avgProfitMxn`. |
| (c) `floor`/`drop` invertidos | **Parcialmente confirmado, matiz distinto al descrito** | `engines/economics/index.ts` ya calcula `floor = min(history)` cuando la parcela no califica para precio de garantía, y `drop = percentil(10%)` — **no** usa índices fijos 0/1 como describe el encargo (ese cálculo por índice ya no existe en el código actual, puede ser de una versión anterior). El problema real que sí existe: nada garantiza `drop >= floor` por construcción — con una serie de precios no monótona, el percentil 10 puede caer por debajo del mínimo si hay valores negativos o atípicos, aunque con los datos simulados actuales no se observa. Se corrige igual, garantizando `drop = max(percentil(10%), floor ?? -Infinity)` cuando ambos existen, documentado en el código. |
| (d) N+1 en precios | **Sí** | `fetchPriceHistory` hace 12 `await` secuenciales dentro de un `for` por estrategia (`routes/plots.ts:162-174`), una vez por estrategia. |
| (e) alternativas O(n²) | **Sí** | `buildAlternativeStrategies` (`engines/rotation/index.ts:155-184`) ya lo documenta en un comentario: genera todos los pares distintos. Se limita a N configurable (default 5) por `totalScore`. |
| (f) evidencia con origen fijo | **Sí** | `buildIndicatorEvidence` (`engines/rotation/index.ts:70-79`) fija `kind: 'estimated', origin: 'simulated'` en vez de leerlo de la fuente real de cada indicador. |
| (g) beneficio de sequía sin comprobar | **Sí** | `buildBenefits` (`engines/rotation/index.ts:46-48`) agrega la frase de tolerancia a sequía sin mirar `plot.constraints.waterAvailability`. |
| (h) versionado nominal | **Sí** | `ENGINE_VERSION`/`CATALOG_VERSION` son literales `'1.0.0'` en `engines/rotation/index.ts:9-10`, no derivadas de nada. |

### Modelo

| # | Confirmado | Nota |
|---|---|---|
| (i) descarga de NASA dentro de la petición | **Parcialmente confirmado** | `agrovia_api/main.py` sí llama a los clientes de forma sincrónica dentro de la petición HTTP, y sí devuelve 502 si NASA/ORNL fallan (`main.py:49-58`). Pero **ya existen timeouts explícitos** (`HTTP_TIMEOUT_SECONDS=90`, `ORNL_TIMEOUT_SECONDS=20` en `config.py`) — el encargo decía que no había. Lo que falta de verdad: caché en memoria (no existe ninguna) y degradar a advertencia en vez de 502 cuando NASA falla pero ORNL responde (o viceversa). |
| (j) `.joblib` rompe LFS | **Sí, confirmado con evidencia directa** | `git check-attr filter -- Modelo/modelo_agrovia.joblib` → `filter: lfs`, pero `git lfs ls-files` no lo lista: es un blob real de 518,313 bytes ya mezclado en main (commit `39f4323`). `scripts/test-modelo-lfs.sh` solo revisa `Modelo/model.pt`, `Modelo/models/nested/weights.onnx`, `Modelo/x.h5`, `Modelo/x.pkl` — ninguno existe, así que siempre pasa. **Decisión del usuario:** sacar `*.joblib` de LFS (archivo ya comiteado, 506 KB, no vale el riesgo de reescribir historia con force-push sobre un PR ya mergeado). |

### AppMovil

| # | Confirmado | Nota |
|---|---|---|
| (k) falta plugin Kotlin | **Sí** | Confirmado en `AppMovil/AgroViaApp/agrovia-figma-android-/build.gradle.kts` y `app/build.gradle.kts`: solo `com.android.application`, sin `org.jetbrains.kotlin.android`, sin bloque `dependencies`. `compileSdk=35` vs `targetSdk=34`. |
| (l) WebView no puede hablar con el backend | **Sí** | `AndroidManifest.xml`: `usesCleartextTraffic="false"`, sin `network_security_config.xml`. |
| (m) sin CI real | **Sí** | `.github/workflows/appmovil-ci.yml` usa `flutter-action`/`pubspec.yaml`; no hay ningún `pubspec.yaml` en el repo (proyecto es Android nativo, ver hallazgo §1). `scripts/lint-folder.sh` hace skip limpio (exit 0) cuando falta el manifiesto — funciona como se diseñó, pero el diseño asumía Flutter. |
| (n) archivos muertos en `assets/` | **Sí** | `app/src/main/assets/app.js`, `index.html`, `styles.css` no se referencian desde `MainActivity.kt` (que carga `assets/www/index.html`). |

## 4. Decisiones consultadas y resueltas con el usuario

1. **`.joblib` y LFS:** se sale de LFS (quitar `*.joblib` de `.gitattributes`); no se migra ni se reescribe historia.
2. **Despliegue del Backend:** mismo proveedor que el Modelo (Render). `MODELO_BASE_URL` queda como variable de entorno obligatoria sin URL por defecto — no se asume una IP/host fija.
3. **Autenticación de Firebase:** anónima. No cambia el middleware del Backend (`verifyIdToken` + comparación de `uid` funciona igual para auth anónima o por correo); afecta solo al flujo de la app, que ya está bloqueado por la sección 0.

## 5. Orden de trabajo

Sigo el orden del encargo (sección 6), con el hallazgo de documentación (§1 arriba) incluido en el paso 2 porque usa los mismos archivos:

1. ~~`INTEGRACION.md`~~ — este archivo.
2. AppMovil (k)(l)(m)(n) + corregir `AGENTS.md`/`CLAUDE.md` de Flutter → Android nativo.
3. Backend (a): autenticación.
4. Backend (b)(c)(d)(e)(f)(g)(h), con sus pruebas.
5. Modelo (i)(j).
6. Rutas angostas nuevas en el Modelo (`/clima`, `/ndvi`, `/predecir`, `/municipio`, `/cultivos`), con caché y pruebas.
7. `Backend/src/integration/modeloMapper.ts` + proveedores reales (`ModeloClimateProvider`, `ModeloNdviProvider`, `ModeloCropCriteriaProvider`) detrás de `USE_SIMULATED_PROVIDERS`.
8. Criterio `modelSuccess` en `engines/rotation/scoring.ts`.
9. Pruebas de la sección 5 del encargo.
10. `docs/ejemplos-api.http` + guía para frontend.
11. Revisar/actualizar el README raíz.

## 6. Qué queda simulado al cerrar esta fase

- Con `USE_SIMULATED_PROVIDERS=true` (default en pruebas): todo el Backend sigue funcionando sin red ni credenciales, como exige el encargo.
- Con `USE_SIMULATED_PROVIDERS=false`: clima y NDVI vienen del Modelo (que a su vez llama a NASA POWER/ORNL real); el catálogo de cultivos puede venir del Modelo (INIFAP) en vez de Firestore.
- El Modelo sigue siendo la única pieza con credenciales de Earthdata (no se tocan, viven en su entorno).
- El frontend sigue sirviendo datos de demostración — bloqueado, ver sección 0.
