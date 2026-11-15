# AGROVÍA — Módulo de Inteligencia Artificial, Datos y Backend

> **Servicio:** API FastAPI `AgroVia Parcel Evaluation API`  
> **Versión del paquete:** `0.1.0` (`agrovia_api/__init__.py`)  
> **Carpeta:** `AgroVia/Modelo/`  
> **Documento complementario:** [`DOCUMENTACION_TECNICA_MODELO.md`](DOCUMENTACION_TECNICA_MODELO.md)

> **Nota de alcance verificada contra el código actual.** El repositorio implementa la evaluación de **un cultivo por parcela**: recibe el perfil de la parcela, consulta NASA POWER y MODIS NDVI, ejecuta el modelo Random Forest y calcula un puntaje agronómico con umbrales INIFAP. El **ranking multicultivo**, el **plan de rotación a dos ciclos** y el endpoint `GET /api/v1/cultivos` **no están implementados** en esta versión. Este README documenta lo que existe y marca explícitamente esas brechas para que el equipo móvil no consuma contratos inexistentes.

---

## 1. ¿Qué es AGROVÍA? (Visión General)

AGROVÍA es una herramienta de apoyo a la decisión agrícola para el estado de Durango. El problema que atiende es concreto: buena parte de la producción de granos y forrajes depende de temporal, con lluvia errática, sequías intraestivales, heladas tempranas y suelos con distinto nivel de degradación. En ese contexto, el productor y el técnico necesitan una recomendación que combine el clima real del ciclo, la vocación agronómica del cultivo y la evidencia histórica de la región, no una sola señal aislada.

La arquitectura es **híbrida** porque integra tres capas de conocimiento:

1. **Ciencia agronómica (INIFAP):** el catálogo `datasets/cultivos_inifap.json` define, para cada cultivo, familias botánicas, ciclos, modalidades recomendadas y rangos ambientales en forma de trapecios para lluvia, temperatura media, temperatura mínima extrema y radiación.
2. **Datos satelitales (NASA POWER + MODIS):** NASA POWER aporta clima diario agregado al ciclo del cultivo; ORNL DAAC aporta NDVI MODIS como indicador complementario de vigor vegetal.
3. **Evidencia histórica (SIAP):** los cierres agrícolas 2016–2025 permiten construir la variable objetivo `exito_cosecha` y entrenar un clasificador Random Forest con contexto municipal, cultivo y modalidad.

El resultado actual es una evaluación por cultivo que devuelve:

- probabilidad estimada de éxito de cosecha (`evaluacion_modelo`);
- clasificación cualitativa de esa probabilidad (`alto`, `medio`, `bajo`);
- puntaje agronómico difuso contra los umbrales INIFAP (`evaluacion_agronomica`);
- datos climáticos y NDVI de la ventana analizada;
- advertencias explícitas cuando falta una fuente, la modalidad no es la recomendada o el clima se aleja del óptimo.

AGROVÍA **no sustituye** un análisis físico-químico de suelo, la revisión de un técnico en campo ni el conocimiento local del productor. Es una segunda opinión cuantificada que ordena señales y hace visibles sus supuestos.

---

## 2. Arquitectura del Sistema (Diagrama en Texto)

### 2.1 Flujo implementado

```text
AppMovil / Backend
        │
        │  POST /api/v1/evaluar-parcela
        │  JSON: latitud, longitud, superficie_hectareas, tipo_terreno,
        │        tipo_suelo, disponibilidad_agua, sistema_riego,
        │        cultivo_actual, fecha_siembra, etapa_crecimiento
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FastAPI — agrovia_api/main.py                                       │
│  ParcelaInput (Pydantic v2, extra="forbid")                         │
│  Dependencia get_service() -> AgroViaService                        │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AgroViaService.evaluate() — agrovia_api/service.py                  │
│                                                                     │
│  1. Valida que fecha_siembra <= hoy.                                │
│  2. Resuelve cultivo_actual contra datasets/cultivos_inifap.json.   │
│  3. Normaliza sistema_riego a modalidad temporal | riego.            │
│  4. Detecta el municipio más cercano con Haversine.                 │
│  5. Normaliza etapa_crecimiento y calcula la ventana de análisis.   │
│  6. Consulta NASA POWER para lat/lon y ventana.                     │
│  7. Consulta ORNL DAAC MODIS NDVI (opcional, degradación elegante). │
│  8. Construye 8 variables y ejecuta el Random Forest.               │
│  9. Calcula el puntaje agronómico difuso con 4 trapecios INIFAP.    │
│ 10. Agrega advertencias y arma la respuesta.                        │
└─────────────────────────────────────────────────────────────────────┘
        │
        ├──► NASA POWER daily point (community AG)
        │       PRECTOTCORR, T2M, T2M_MIN, T2M_MAX, ALLSKY_SFC_SW_DWN
        │       Salida: lluvia_ciclo_mm, temp_media_c, temp_max_c,
        │               temp_min_extrema_c, radiacion_mj_m2, n_dias
        │
        ├──► ORNL DAAC MODIS/VIIRS Land Products Web Service
        │       Producto MOD13Q1, banda 250m_16_days_NDVI
        │       Si falla o no hay observaciones: ndvi=null + advertencia
        │
        ├──► modelo_agrovia.joblib
        │       Pipeline scikit-learn: OneHotEncoder + StandardScaler
        │       + RandomForestClassifier
        │       Salida: probabilidad_exito, clase_predicha 0/1
        │
        └──► datasets/cultivos_inifap.json
                Trapecios INIFAP -> puntaje por variable y puntaje global
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RespuestaEvaluacion (JSON)                                          │
│ parcela + municipio + cultivo + ventana_analisis + clima + ndvi     │
│ + evaluacion_modelo + evaluacion_agronomica + advertencias          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Ventana de análisis

La ventana no siempre cubre todo el ciclo. `agrovia_api/agronomy.py` define una fracción del ciclo máximo según la etapa fenológica declarada:

| Etapa canónica | Fracción del ciclo máximo |
|---|---:|
| `siembra` | 0.15 |
| `emergencia` | 0.20 |
| `vegetativo` | 0.40 |
| `floracion` | 0.60 |
| `fructificacion` | 0.80 |
| `madurez` | 0.95 |
| `cosecha` | 1.00 |
| `desconocida` | 1.00 |

El fin de ventana es `min(hoy, fecha_siembra + round(fracción × duración_máxima_del_ciclo))`, y nunca es anterior a la fecha de siembra. Si la etapa no se reconoce, se usa `desconocida`, se analiza el ciclo completo y se agrega una advertencia.

### 2.3 Lo que no está implementado en esta versión

El diagrama anterior termina en la evaluación de **un solo cultivo**. Las siguientes piezas son una **extensión de producto** y no deben documentarse al equipo móvil como si existieran:

- `GET /api/v1/cultivos`: no está definido en `agrovia_api/main.py`. El catálogo vive en `datasets/cultivos_inifap.json`.
- **Ranking de cultivos**: no hay endpoint que evalúe los 15 cultivos y los ordene. El script `test_escenarios_modelo.py` hace un ranking local con el modelo, pero es una herramienta de análisis offline, no un contrato HTTP.
- **Plan de rotación a dos ciclos**: no existe módulo, endpoint ni campo de respuesta. Las reglas agronómicas propuestas se describen en el anexo técnico, siempre marcadas como diseño futuro.

Si el hackatón requiere mostrar el ranking, la vía actual es invocar `POST /api/v1/evaluar-parcela` una vez por cultivo y ordenar las respuestas por `evaluacion_modelo.probabilidad_exito`. Esa comparación no incorpora todavía rotación ni historial de parcelas.

### 2.4 Extensión propuesta: ranking y rotación a dos ciclos (no implementada)

La visión de producto completa se puede representar así, siempre marcada como **diseño futuro**:

```text
Entrada: perfil de parcela + cultivo_actual + clima del ciclo
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Evaluar candidatos del catálogo INIFAP                       │
│    - Para cada cultivo: mismas 8 variables y mismo clima        │
│    - Random Forest -> P(exito_cosecha)                          │
│    - Lógica difusa INIFAP -> puntaje climático                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Aplicar motor de rotación (propuesto, no implementado)       │
│    - Leguminosas: bonus por fijación de nitrógeno               │
│    - Gramíneas: penalización por extracción y repetición        │
│    - Asteráceas: bonus por descompactación / rompe-ciclo        │
│    - Monocultivo: penalización por misma especie o familia      │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Salida propuesta                                             │
│    - Ranking de cultivos con probabilidad y puntaje             │
│    - Plan de dos ciclos con justificación agronómica            │
│    - Advertencias, supuestos y limitaciones                     │
└─────────────────────────────────────────────────────────────────┘
```

Esta extensión requeriría un endpoint nuevo (hoy no definido), un esquema de historial de cultivos, un módulo de rotación y validación agronómica con datos locales. No forma parte del contrato actual.

---

## 3. Estructura del Proyecto

```text
Modelo/
├── agrovia_api/                       Paquete importable del servicio FastAPI
│   ├── __init__.py                    Versión 0.1.0 y docstring del paquete
│   ├── main.py                        App FastAPI, endpoints y manejo de errores
│   ├── schemas.py                     Contratos Pydantic de entrada y salida
│   ├── service.py                     Orquestación de clima, NDVI, modelo y reglas
│   ├── agronomy.py                    Trapecios INIFAP, etapas y ventana fenológica
│   ├── catalogs.py                    Carga de catálogos JSON
│   ├── config.py                      Rutas, URLs y variables de entorno
│   ├── errors.py                      Errores de dominio de la evaluación
│   ├── geo.py                         Haversine y municipio más cercano
│   ├── model_runner.py                Carga del joblib y predicción del Random Forest
│   └── clients/
│       ├── nasa_power.py              Cliente NASA POWER daily point
│       └── ornl_modis.py              Cliente ORNL DAAC MODIS NDVI
│
├── datasets/
│   ├── cultivos_inifap.json           Catálogo de 15 cultivos con umbrales INIFAP
│   ├── municipios_durango.json        39 municipios con cve_mun, lat y lon
│   └── datasets_cierre_agricola_raw_data/
│       ├── Cierre_agricola_mun_2016.csv
│       ├── ...
│       └── Cierre_agricola_mun_2025.csv
│
├── clean_siap.py                      Limpieza SIAP y creación de exito_cosecha
├── fetch_historical_nasa.py           Descarga NASA POWER histórica y dataset maestro
├── train_model.py                     Entrenamiento y serialización del Random Forest
├── probar_modelo.py                   Demo comparativa de cultivos con el joblib
├── test_escenarios_modelo.py          Simulación offline de 5 escenarios y ranking
│
├── siap_durango_limpio.csv            Intermedio: SIAP limpio a nivel municipio
├── clima_nasa_durango.csv             Caché: clima NASA POWER por municipio y año
├── dataset_durango_final.csv          Dataset maestro: SIAP + clima
├── modelo_agrovia.joblib              Pipeline entrenado (patrón LFS en .gitattributes)
├── mi_parcela.json                    Ejemplo de entrada para CLI y pruebas
│
├── tests/                             Suite pytest completamente offline
│   ├── fakes.py
│   ├── test_agronomy.py
│   ├── test_api.py
│   ├── test_example_contract.py
│   ├── test_geo.py
│   ├── test_model_runner.py
│   ├── test_nasa_power.py
│   ├── test_ornl_modis.py
│   └── test_service.py
│
├── conftest.py                        Agrega Modelo/ al sys.path para pytest
├── requirements.txt                   Dependencias del módulo
├── AGENTS.md / CLAUDE.md              Reglas del repositorio para agentes
└── .gitattributes                     Modelos *.joblib bajo Git LFS
```

### Descripción breve de cada pieza

| Ruta | Rol |
|---|---|
| `agrovia_api/main.py` | Define la app, los tres endpoints actuales y traduce errores de dominio a HTTP 422/502/500. |
| `agrovia_api/schemas.py` | `ParcelaInput` exige los 10 campos y prohíbe campos extra; `RespuestaEvaluacion` define el JSON de salida. |
| `agrovia_api/service.py` | Valida la parcela, detecta municipio, consulta clima y NDVI, ejecuta el modelo, calcula el puntaje agronómico y genera advertencias. |
| `agrovia_api/agronomy.py` | Normaliza etapas, calcula la ventana, implementa el trapecio `[a,b,c,d]` y clasifica el puntaje global. |
| `agrovia_api/model_runner.py` | Verifica las 8 variables, carga `modelo_agrovia.joblib` y devuelve `(probabilidad_clase_1, clase_predicha)`. |
| `agrovia_api/clients/nasa_power.py` | Consulta NASA POWER y agrega lluvia, temperaturas y radiación. Solo enmascara el valor de relleno documentado. |
| `agrovia_api/clients/ornl_modis.py` | Consulta MOD13Q1 250 m, ventana de 16 días, y extrae el píxel central. Su fallo no tumba la evaluación. |
| `clean_siap.py` | Lee los CSV crudos, filtra Durango, normaliza, agrega a municipio y deriva `exito_cosecha`. |
| `fetch_historical_nasa.py` | Descarga clima junio–octubre por municipio y año, cachea y hace el join con SIAP. |
| `train_model.py` | Construye el pipeline, entrena, imprime métricas e importancias y guarda el `.joblib`. |
| `tests/` | Pruebas con clientes y modelo simulados; no hacen llamadas reales a NASA ni ORNL. |
| `probar_modelo.py` | Script exploratorio que compara cinco cultivos en dos climas sintéticos. No es parte de la API. |
| `test_escenarios_modelo.py` | Script exploratorio de cinco escenarios y ranking offline de los 15 cultivos. No es un endpoint. |

---

## 4. Instalación y Ejecución Rápida

### 4.1 Requisitos

- Python **3.10 o superior** (el entorno de referencia del repositorio usa Python 3.14).
- Acceso a Internet para las consultas reales a NASA POWER y ORNL DAAC.
- Git LFS si el artefacto `modelo_agrovia.joblib` se distribuye con LFS; el patrón `*.joblib` ya está declarado en `.gitattributes`. En el estado actual del working tree el archivo existe localmente y debe añadirse con LFS al commitear.

### 4.2 Entorno virtual e instalación

Desde la carpeta `Modelo/`:

```bash
cd Modelo
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

`requirements.txt` instala FastAPI, Uvicorn, Pydantic, HTTPX, Requests, Pandas, NumPy, scikit-learn y joblib. El archivo `requirements.txt` de la raíz agrega `xarray` y `netCDF4`; no son necesarios para este módulo.

Para desarrollo y pruebas, instala también las herramientas que no están en `requirements.txt`:

```bash
pip install pytest ruff
```

Si el modelo no aparece después de clonar:

```bash
git lfs install
git lfs pull
```

### 4.3 Análisis directo por línea de comandos

El CLI evalúa un archivo JSON y escribe la respuesta completa en stdout:

```bash
python -m agrovia_api.cli mi_parcela.json
```

Sin argumento usa el ejemplo del repositorio, cuya ruta por defecto es `../Backend/parcela_ejemplo.json`:

```bash
python -m agrovia_api.cli
```

Para guardar la respuesta:

```bash
python -m agrovia_api.cli mi_parcela.json > respuesta.json
```

### 4.4 Servidor FastAPI y Swagger UI

Desde `Modelo/`:

```bash
uvicorn agrovia_api.main:app --reload
```

Abrir:

- Swagger UI: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>
- Health check: <http://127.0.0.1:8000/health>

Para exponerlo en un contenedor o en Render:

```bash
uvicorn agrovia_api.main:app --host 0.0.0.0 --port 8000
```

### 4.5 Pruebas

Desde `Modelo/`:

```bash
pytest -q
```

Si `pytest` no está instalado: `pip install pytest`. Resultado esperado en el estado actual del repositorio: **43 pruebas aprobadas**. La suite es offline: usa `tests/fakes.py` para clima, NDVI y modelo, y solo el test de `ModelRunner` carga el `.joblib` real.

Si se ejecuta desde la raíz del repositorio, hay que indicar la ruta del paquete:

```bash
PYTHONPATH=Modelo pytest -q Modelo/tests
```

### 4.6 Lint y formato

El repositorio usa Ruff según `Modelo/AGENTS.md`. Si no está instalado: `pip install ruff`.

```bash
ruff check .
ruff format .
```

### 4.7 Variables de entorno útiles

Todas se leen en `agrovia_api/config.py`. Las rutas se pueden sobreescribir sin tocar código.

| Variable | Valor por defecto | Uso |
|---|---|---|
| `AGROVIA_CROPS_PATH` | `Modelo/datasets/cultivos_inifap.json` | Catálogo de cultivos. |
| `AGROVIA_MUNICIPALITIES_PATH` | `Modelo/datasets/municipios_durango.json` | Catálogo de municipios. |
| `AGROVIA_MODEL_PATH` | `Modelo/modelo_agrovia.joblib` | Pipeline entrenado. |
| `AGROVIA_PARCEL_EXAMPLE` | `Backend/parcela_ejemplo.json` | Archivo del endpoint de ejemplo y del CLI sin argumento. |
| `AGROVIA_NASA_POWER_URL` | `https://power.larc.nasa.gov/api/temporal/daily/point` | Endpoint NASA POWER. |
| `AGROVIA_ORNL_BASE_URL` | `https://modis.ornl.gov/rst/api/v1` | Endpoint ORNL DAAC. |
| `AGROVIA_HTTP_TIMEOUT` | `90` segundos | Timeout de NASA POWER. |
| `AGROVIA_ORNL_TIMEOUT` | `20` segundos | Timeout de ORNL; NDVI es complementario y falla rápido. |

---

## 5. Documentación de Endpoints y Contrato JSON (Para el Equipo Frontend/Móvil)

### 5.1 Endpoints reales

| Método | Ruta | Estado | Respuesta |
|---|---|---|---|
| `GET` | `/health` | Implementado | `{"status": "ok", "version": "0.1.0"}` |
| `POST` | `/api/v1/evaluar-parcela` | Implementado | `RespuestaEvaluacion` (JSON descrito abajo) |
| `GET` | `/api/v1/evaluar-parcela/ejemplo` | Implementado | Evalúa `AGROVIA_PARCEL_EXAMPLE`; 404 si el archivo no existe |
| `GET` | `/api/v1/cultivos` | **No implementado** | No existe en `main.py`; el catálogo está en `datasets/cultivos_inifap.json` |

El endpoint de ejemplo depende de `AGROVIA_PARCEL_EXAMPLE`, cuya ruta por defecto es `../Backend/parcela_ejemplo.json`. Si se despliega solo la carpeta `Modelo/` (por ejemplo, en Render) y ese archivo no está incluido, el endpoint devolverá 404; en ese caso configure `AGROVIA_PARCEL_EXAMPLE` con una ruta dentro del despliegue o use el `POST` con el JSON de la sección 5.3.

Códigos de error del `POST`:

| Código | Cuándo |
|---|---|
| `422` | JSON inválido, campo faltante, campo extra, tipo incorrecto, `cultivo_actual` desconocido, `sistema_riego` no mapeable o `fecha_siembra` futura. |
| `502` | NASA POWER no responde o devuelve datos inutilizables. |
| `500` | Falta el artefacto del modelo u otro archivo requerido. |
| `200` | Evaluación completa. Si ORNL falla, **no** se devuelve 502: `ndvi` llega como `null` y se agrega una advertencia. |

### 5.2 Contrato de entrada (`ParcelaInput`)

`ParcelaInput` tiene `extra="forbid"`: **cualquier campo no listado produce 422**. Los 10 campos son obligatorios.

| Campo | Tipo | Restricción / valores | Uso real en el código |
|---|---|---|---|
| `latitud` | `float` | `-90.0` a `90.0` (WGS84) | Municipio más cercano y consulta NASA/ORNL. |
| `longitud` | `float` | `-180.0` a `180.0` (WGS84) | Municipio más cercano y consulta NASA/ORNL. |
| `superficie_hectareas` | `float` | `> 0` | Se valida y se devuelve; **no** entra al modelo ni al puntaje agronómico. |
| `tipo_terreno` | `str` | Cadena no vacía; ej. `plano`, `ondulado` | Se devuelve; **no** entra al modelo ni al puntaje actual. |
| `tipo_suelo` | `str` | Cadena no vacía; ej. `franco`, `arcilloso` | Se devuelve; **no** entra al modelo ni al puntaje actual. |
| `disponibilidad_agua` | `str` | Cadena no vacía; ej. `limitada`, `suficiente` | Se devuelve; **no** entra al modelo ni al puntaje actual. |
| `sistema_riego` | `str` | Sinónimos de temporal o riego (ver tabla) | Se normaliza a `modalidad` y sí entra al modelo. |
| `cultivo_actual` | `str` | Clave exacta del catálogo INIFAP | Se resuelve contra el catálogo y sí entra al modelo. |
| `fecha_siembra` | `date` | `YYYY-MM-DD`; no puede ser futura | Define el inicio de la ventana de análisis. |
| `etapa_crecimiento` | `str` | Texto libre; sinónimos de etapa (ver tabla) | Define la fracción del ciclo y el fin de ventana. |

#### Valores permitidos para `sistema_riego`

`MODALITY_SYNONYMS` en `agrovia_api/service.py` acepta, sin acentos y en minúsculas:

| Valor de entrada | Modalidad resultante |
|---|---|
| `temporal`, `secano` | `temporal` |
| `riego`, `irrigacion`, `gravedad`, `goteo`, `aspersion` | `riego` |

Cualquier otro valor, incluido `"no lo se"`, produce `InvalidModalityError` y HTTP 422.

#### Valores permitidos para `etapa_crecimiento`

`STAGE_SYNONYMS` en `agrovia_api/agronomy.py` normaliza sin acentos y en minúsculas:

| Entradas reconocidas | Etapa canónica |
|---|---|
| `siembra` | `siembra` |
| `plantula`, `plantula emergencia`, `emergencia`, `germinacion` | `emergencia` |
| `vegetativo`, `desarrollo`, `desarrollo vegetativo`, `crecimiento` | `vegetativo` |
| `floracion`, `flor` | `floracion` |
| `fructificacion`, `llenado`, `llenado de grano`, `llenado grano`, `grano` | `fructificacion` |
| `madurez`, `madurez fisiologica` | `madurez` |
| `cosecha`, `recoleccion` | `cosecha` |
| Cualquier otro texto, incluido `"no lo se"` | `desconocida` + advertencia |

#### Valores permitidos para `cultivo_actual`

El catálogo actual tiene **15 cultivos**. La clave debe enviarse exactamente como aparece a la izquierda (el servicio normaliza acentos y mayúsculas, pero no corrige errores de escritura).

| `cultivo_id` | Nombre | Familia | Ciclo principal | Modalidad recomendada |
|---|---|---|---|---|
| `frijol_pinto` | Frijol (Pinto Saltillo / Negro) | leguminosa | Primavera-Verano | temporal, riego |
| `maiz_grano` | Maíz Grano | graminea | Primavera-Verano | riego, temporal |
| `maiz_forrajero` | Maíz Forrajero en Verde | graminea | Primavera-Verano | riego, temporal |
| `avena_forrajera` | Avena Forrajera | graminea | Ambos (PV y OI) | temporal, riego |
| `sorgo_forrajero` | Sorgo Forrajero | graminea | Primavera-Verano | temporal, riego |
| `sorgo_grano` | Sorgo Grano | graminea | Primavera-Verano | temporal, riego |
| `alfalfa` | Alfalfa Verde (Perenne) | leguminosa | Perenne | riego |
| `trigo_grano` | Trigo Grano / Forrajero | graminea | Otoño-Invierno | riego, temporal |
| `cebada_forrajera` | Cebada Forrajera / Grano | graminea | Ambos (PV y OI) | temporal, riego |
| `girasol` | Girasol (Grano / Forrajero) | asteracea | Primavera-Verano | temporal, riego |
| `garbanzo` | Garbanzo (Porquero / Blanco) | leguminosa | Otoño-Invierno | riego, temporal |
| `algodon` | Algodón Hueso | malvacea | Primavera-Verano | riego |
| `chile_verde` | Chile Verde (Jalapeño / Poblano) | solanacea | Primavera-Verano | riego |
| `manzana` | Manzana (Frutal Perenne) | rosacea | Perenne | riego |
| `nuez_pecanera` | Nuez Pecanera (Perenne) | juglandacea | Perenne | riego |

> **Importante:** el modelo actual solo vio **14** de estos 15 cultivos en entrenamiento. `cebada_forrajera` no tiene filas en `dataset_durango_final.csv`. El `OneHotEncoder(handle_unknown="ignore")` la codifica como todas las columnas en cero; la predicción para ese cultivo es una extrapolación, no una estimación respaldada por datos históricos. Ver limitaciones en la sección 6.

#### ¿Se puede enviar `"no lo se"`?

Sí, pero **solo en los campos donde el contrato lo tolera**. Esta tabla evita errores de integración:

| Campo | ¿Acepta `"no lo se"`? | Efecto |
|---|---|---|
| `tipo_terreno` | Sí | Se acepta como cadena no vacía; se devuelve sin uso posterior. |
| `tipo_suelo` | Sí | Se acepta como cadena no vacía; se devuelve sin uso posterior. |
| `disponibilidad_agua` | Sí | Se acepta como cadena no vacía; se devuelve sin uso posterior. |
| `etapa_crecimiento` | Sí | Se normaliza a `desconocida`; se analiza el ciclo completo y se agrega advertencia. |
| `sistema_riego` | **No** | HTTP 422: no se puede determinar `temporal` vs `riego`. |
| `cultivo_actual` | **No** | HTTP 422: no existe la clave en el catálogo. |
| `superficie_hectareas` | **No** | Debe ser numérico `> 0`. |
| `fecha_siembra` | **No** | Debe ser una fecha válida y no futura. |
| `latitud` / `longitud` | **No** | Deben ser numéricos dentro de rango. |

### 5.3 Ejemplo real de entrada

Contenido de `mi_parcela.json`:

```json
{
  "latitud": 24.4442,
  "longitud": -104.1217,
  "superficie_hectareas": 15.0,
  "tipo_terreno": "plano",
  "tipo_suelo": "franco",
  "disponibilidad_agua": "limitada",
  "sistema_riego": "temporal",
  "cultivo_actual": "maiz_grano",
  "fecha_siembra": "2026-06-15",
  "etapa_crecimiento": "cosecha"
}
```

Variante tolerante para una parcela con datos incompletos de suelo y etapa:

```json
{
  "latitud": 24.4442,
  "longitud": -104.1217,
  "superficie_hectareas": 15.0,
  "tipo_terreno": "plano",
  "tipo_suelo": "no lo se",
  "disponibilidad_agua": "no lo se",
  "sistema_riego": "temporal",
  "cultivo_actual": "maiz_grano",
  "fecha_siembra": "2026-06-15",
  "etapa_crecimiento": "no lo se"
}
```

Esta variante es válida porque `tipo_suelo` y `disponibilidad_agua` son cadenas libres, y `etapa_crecimiento` desconocida se degrada a ciclo completo con advertencia. **No** se debe enviar `"no lo se"` en `sistema_riego` ni en `cultivo_actual`.

### 5.4 Ejemplo real de salida

Respuesta obtenida al ejecutar `python -m agrovia_api.cli mi_parcela.json` contra NASA POWER real. En esa ejecución ORNL DAAC no respondió a tiempo, por lo que `ndvi` es `null` y la advertencia lo explica. Es el comportamiento esperado de degradación elegante; si ORNL responde, `ndvi` será un objeto con la serie MODIS.

```json
{
  "parcela": {
    "latitud": 24.4442,
    "longitud": -104.1217,
    "superficie_hectareas": 15.0,
    "tipo_terreno": "plano",
    "tipo_suelo": "franco",
    "disponibilidad_agua": "limitada",
    "sistema_riego": "temporal",
    "cultivo_actual": "maiz_grano",
    "fecha_siembra": "2026-06-15",
    "etapa_crecimiento": "cosecha"
  },
  "municipio": {
    "cve_mun": 8,
    "municipio": "Guadalupe Victoria",
    "distancia_km": 0.0
  },
  "cultivo": {
    "cultivo_id": "maiz_grano",
    "nombre": "Maíz Grano",
    "familia": "graminea",
    "ciclo_principal": "Primavera-Verano",
    "modalidad_recomendada": [
      "riego",
      "temporal"
    ],
    "duracion_ciclo_dias": [
      110,
      135
    ],
    "notas_tecnicas": "Alta demanda hídrica y de nitrógeno. En temporal de Durango requiere buen temporal en julio-agosto o riego de auxilio."
  },
  "ventana_analisis": {
    "inicio": "2026-06-15",
    "fin": "2026-10-28",
    "etapa_crecimiento": "cosecha",
    "dias": 136
  },
  "clima": {
    "fuente": "NASA POWER daily point (community AG)",
    "ventana_inicio": "2026-06-15",
    "ventana_fin": "2026-10-28",
    "n_dias": 136,
    "lluvia_ciclo_mm": 399.62,
    "temp_media_c": 21.25,
    "temp_max_c": 28.05,
    "temp_min_extrema_c": 6.75,
    "radiacion_mj_m2": 20.96
  },
  "ndvi": null,
  "evaluacion_modelo": {
    "modelo": "modelo_agrovia.joblib",
    "probabilidad_exito": 0.5164,
    "clase_predicha": 1,
    "clasificacion": "medio"
  },
  "evaluacion_agronomica": {
    "puntaje_global": 0.6138,
    "clasificacion": "adecuado",
    "puntajes": [
      {
        "variable": "lluvia_mm",
        "valor": 399.62,
        "umbral": [
          380.0,
          500.0,
          750.0,
          1000.0
        ],
        "puntaje": 0.1635
      },
      {
        "variable": "temp_media_c",
        "valor": 21.25,
        "umbral": [
          15.0,
          20.0,
          28.0,
          34.0
        ],
        "puntaje": 1.0
      },
      {
        "variable": "temp_min_ciclo_c",
        "valor": 6.75,
        "umbral": [
          5.0,
          11.0,
          20.0,
          26.0
        ],
        "puntaje": 0.2917
      },
      {
        "variable": "radiacion_mj_m2",
        "valor": 20.96,
        "umbral": [
          16.0,
          20.0,
          26.0,
          30.0
        ],
        "puntaje": 1.0
      }
    ]
  },
  "advertencias": [
    "No se pudo consultar NDVI de ORNL DAAC (ORNL DAAC request failed: HTTPSConnectionPool(host='modis.ornl.gov', port=443): Read timed out. (read timeout=20.0)); la evaluación continúa sin este indicador."
  ]
}
```

### 5.5 Contrato de salida (`RespuestaEvaluacion`)

| Campo | Tipo | Descripción |
|---|---|---|
| `parcela` | objeto `ParcelaInput` | Eco del perfil recibido. |
| `municipio.cve_mun` | entero | Clave del municipio más cercano (catálogo de 39). |
| `municipio.municipio` | string | Nombre del municipio. |
| `municipio.distancia_km` | float | Distancia Haversine al centroide municipal, redondeada a 2 decimales. |
| `cultivo` | objeto | Metadatos del catálogo: `cultivo_id`, `nombre`, `familia`, `ciclo_principal`, `modalidad_recomendada`, `duracion_ciclo_dias`, `notas_tecnicas`. |
| `ventana_analisis` | objeto | `inicio`, `fin`, `etapa_crecimiento` canónica y `dias` (inclusive). |
| `clima` | objeto | Agregados NASA POWER: `fuente`, `ventana_inicio`, `ventana_fin`, `n_dias`, `lluvia_ciclo_mm`, `temp_media_c`, `temp_max_c`, `temp_min_extrema_c`, `radiacion_mj_m2`. |
| `ndvi` | objeto o `null` | Si ORNL responde: `fuente`, `producto`, `banda`, ventana, `n_observaciones`, `ndvi_medio`, `ndvi_max`, `ndvi_min`, `ndvi_ultimo` y `serie` de `{fecha, ndvi}`. Si falla: `null`. |
| `evaluacion_modelo.modelo` | string | Nombre del archivo del modelo (`modelo_agrovia.joblib`). |
| `evaluacion_modelo.probabilidad_exito` | float | Probabilidad de clase `1` (`exito_cosecha`), redondeada a 4 decimales. |
| `evaluacion_modelo.clase_predicha` | entero | `0` o `1` según `argmax` de las probabilidades. |
| `evaluacion_modelo.clasificacion` | string | `alto` si `p >= 0.66`; `medio` si `0.33 <= p < 0.66`; `bajo` si `p < 0.33`. |
| `evaluacion_agronomica.puntaje_global` | float | Promedio simple de los puntajes de los 4 trapecios, en `[0, 1]`. |
| `evaluacion_agronomica.clasificacion` | string | `optimo` si `>= 0.80`; `adecuado` si `>= 0.60`; `marginal` si `>= 0.40`; `inadecuado` si `< 0.40`. |
| `evaluacion_agronomica.puntajes[]` | lista | Una entrada por variable: `variable`, `valor`, `umbral` (4 límites) y `puntaje`. |
| `advertencias` | lista de strings | Modalidad no recomendada, clima inadecuado, probabilidad baja, NDVI no disponible o etapa desconocida. |

### 5.6 Reglas de advertencia que el frontend debe mostrar

`AgroViaService._add_advisories()` genera advertencias cuando:

1. La modalidad (`temporal`/`riego`) no está entre las `modalidad_recomendada` del cultivo.
2. El puntaje agronómico global es `< 0.40`.
3. La probabilidad de éxito del modelo es `< 0.33`.
4. La etapa de crecimiento no se reconoce.
5. ORNL DAAC falla o no devuelve observaciones NDVI.

Mostrar estas advertencias es parte del contrato de transparencia: no son errores, son condiciones que el usuario debe conocer antes de decidir.

### 5.7 Ejemplos de error

Cultivo desconocido (`POST` con `"cultivo_actual": "quinoa"`):

```json
{
  "detail": "Unknown cultivo_actual 'quinoa'. Valid values: alfalfa, algodon, avena_forrajera, cebada_forrajera, chile_verde, frijol_pinto, garbanzo, girasol, maiz_forrajero, maiz_grano, manzana, nuez_pecanera, sorgo_forrajero, sorgo_grano, trigo_grano"
}
```

Campo extra:

```json
{
  "detail": [
    {
      "type": "extra_forbidden",
      "loc": ["body", "extra"],
      "msg": "Extra inputs are not permitted"
    }
  ]
}
```

NASA POWER caído:

```json
{
  "detail": "Upstream NASA POWER error: NASA POWER request failed: ..."
}
```

### 5.8 Nota para el equipo móvil sobre el ranking

No existe un endpoint de ranking. Para construir una comparación hoy:

1. Tome la lista de claves de la sección 5.2.
2. Invoque `POST /api/v1/evaluar-parcela` una vez por cultivo.
3. Ordene por `evaluacion_modelo.probabilidad_exito` y muestre también `evaluacion_agronomica.puntaje_global` y `advertencias`.
4. No prometa al usuario un “plan de rotación” desde la API: ese cálculo no está implementado.

El script `test_escenarios_modelo.py` muestra cómo se hace ese ranking en local con el joblib, pero no sustituye un endpoint ni aplica rotación.

---

## 6. Fuentes de Datos, Metodología y Transparencia Científica

### 6.1 Fuentes oficiales

| Fuente | Rol en el sistema | Dónde se usa | Limitación principal |
|---|---|---|---|
| **SIAP** (Servicio de Información Agroalimentaria y Pesquera) | Cierres agrícolas municipales 2016–2025: superficie sembrada, cosechada, rendimiento por cultivo y modalidad. | `clean_siap.py` construye el dataset limpio y la variable `exito_cosecha`. | Datos agregados y autodeclarados; la calidad y cobertura varían por municipio y año. |
| **INIFAP** (Instituto Nacional de Investigaciones Forestales, Agrícolas y Pecuarias) | Catálogo agronómico: familias, ciclos, modalidades recomendadas, duración y trapecios ambientales. | `datasets/cultivos_inifap.json`, `agrovia_api/agronomy.py` y `service.py`. | Los umbrales son referencias agronómicas, no una calibración estadística por parcela. |
| **NASA POWER** | Clima diario y agregados del ciclo: lluvia, temperatura media, máxima, mínima extrema y radiación. | `fetch_historical_nasa.py` para entrenamiento; `agrovia_api/clients/nasa_power.py` para inferencia. | Resolución espacial de ~50 km; no representa microclima de parcela. |
| **ORNL DAAC MODIS** (producto `MOD13Q1`, banda `250m_16_days_NDVI`) | NDVI compuesto cada 16 días como indicador complementario de vigor vegetal. | `agrovia_api/clients/ornl_modis.py`. | Resolución de 250 m, compuesto de 16 días y píxel mixto; **no** alimenta al modelo. |

### 6.2 Modelo híbrido: qué se combina y qué no

El término “híbrido” en AGROVÍA describe la **coexistencia de dos evaluaciones complementarias**, no una única fórmula ponderada:

1. **Random Forest (`modelo_agrovia.joblib`)**
   - Se entrena con una partición 80/20 de 3,690 registros municipio-cultivo-modalidad-año (2,952 de entrenamiento y 738 de prueba).
   - Estima `P(exito_cosecha = 1)` a partir de 8 variables: cultivo, modalidad, municipio, lluvia, temperatura media, temperatura máxima, temperatura mínima extrema y radiación.
   - La probabilidad se clasifica en `alto` (`>= 0.66`), `medio` (`>= 0.33`) o `bajo` (`< 0.33`).

2. **Lógica difusa INIFAP (`agrovia_api/agronomy.py`)**
   - Cada cultivo define cuatro trapecios `[a, b, c, d]` para lluvia, temperatura media, temperatura mínima extrema y radiación.
   - Cada variable recibe un puntaje en `[0, 1]`.
   - El puntaje global es el **promedio simple** de los cuatro puntajes; no hay pesos distintos por variable en el código actual.
   - El puntaje se clasifica en `optimo` (`>= 0.80`), `adecuado` (`>= 0.60`), `marginal` (`>= 0.40`) o `inadecuado` (`< 0.40`).

3. **Motor de rotación de suelos**
   - **No está implementado.** No hay módulo, endpoint ni campo de respuesta.
   - El catálogo sí contiene `familia` y `notas_tecnicas`, que serían la base de una extensión.
   - Las reglas agronómicas propuestas (fijación de nitrógeno en leguminosas, extracción en gramíneas, descompactación en asteráceas y penalización por monocultivo) se documentan en el anexo técnico como **diseño futuro**, no como comportamiento actual.

**No existe una ponderación conjunta tipo `0.5 × Random Forest + 0.5 × lógica difusa`.** La respuesta entrega ambos resultados por separado para que el usuario y el frontend los interpreten. Si el producto requiere un índice único, ese índice debe definirse, calibrarse y validarse; hoy no está en el código.

### 6.3 Resolución espacial y limitaciones transparentes

- **NASA POWER** tiene una resolución de aproximadamente **50 km** (rejilla de ~0.5° × 0.625°). Es útil para caracterizar el ciclo climático regional, pero no distingue dos parcelas vecinas con suelos o pendientes distintas.
- **MODIS NDVI** tiene **250 m** por píxel y compuestos de **16 días**. Un píxel puede mezclar cultivo, suelo desnudo, caminos y vegetación natural. Además, el cliente actual toma el **píxel central** de una submuestra de 1 km, no un promedio de toda la parcela.
- **El modelo se entrenó con clima de centroides municipales** (`fetch_historical_nasa.py` usa `municipios_durango.json`), mientras que en inferencia se consulta NASA POWER en la coordenada de la parcela. Aunque la rejilla de ~50 km suele coincidir, no es idéntico y puede haber desplazamiento de distribución.
- **El modelo se entrenó a escala municipal**, no de parcela. La probabilidad es una estimación de contexto, no un pronóstico individual.
- **No se usan** `tipo_suelo`, `tipo_terreno`, `disponibilidad_agua` ni `superficie_hectareas` en el modelo ni en el puntaje actual. No hay análisis de pH, materia orgánica, textura, salinidad, pendiente, drenaje, historial de fertilización, plagas, variedad, densidad de siembra ni precio de mercado.
- **La variable objetivo es un proxy**: mide éxito de cosecha y rendimiento relativo al mediano histórico, no rentabilidad ni sostenibilidad.
- **Hay desbalance de clases** (873 fracasos vs. 2,817 éxitos en el dataset actual) y cultivos con muy pocos registros (`girasol`: 8, `garbanzo`: 2, `algodon`: 30). Las probabilidades para esos cultivos son menos confiables.
- **`cebada_forrajera` no tiene filas de entrenamiento**. La API la acepta, pero el modelo la trata como categoría desconocida; su predicción es una extrapolación.
- **La probabilidad del Random Forest no está calibrada**. `class_weight="balanced"` ayuda al desbalance, pero no garantiza que `0.7` signifique “70% de probabilidad real”. Úsese como señal relativa, no como certeza.
- **El NDVI no entra al modelo**. Es un indicador visual complementario; su ausencia no invalida la evaluación.

Por todo lo anterior, la recomendación de AGROVÍA **complementa** y **no sustituye**:

- un análisis físico-químico de suelo;
- una visita técnica de campo;
- el conocimiento del historial de la parcela;
- la evaluación económica del ciclo;
- las alertas fitosanitarias locales.

### 6.4 Integridad de datos

- Los valores de NASA POWER se pasan como llegan; la única limpieza es enmascarar el valor de relleno documentado (`-999` o valores `<= -900`) antes de las agregaciones (suma de lluvia, medias de temperatura y radiación, mínimo de temperaturas mínimas).
- No se rellenan, interpolan ni “corrigen” observaciones faltantes. Si no hay datos utilizables, la evaluación falla con HTTP 502 (NASA) o degrada con `ndvi=null` (ORNL).
- Los ejemplos de este documento provienen de una ejecución real del CLI contra NASA POWER. La respuesta mostrada incluye la advertencia real de timeout de ORNL; no se inventaron valores de NDVI.
- Los scripts exploratorios `probar_modelo.py` y `test_escenarios_modelo.py` usan climas sintéticos para comparar cultivos. Sus salidas no deben presentarse como observaciones NASA reales.

### 6.5 Verificación de consistencia con el código

Este documento se contrastó contra:

- `agrovia_api/main.py`: los tres endpoints reales, la versión `0.1.0` y los códigos de error.
- `agrovia_api/schemas.py`: los 10 campos obligatorios, `extra="forbid"` y la estructura de `RespuestaEvaluacion`.
- `agrovia_api/agronomy.py`: fracciones por etapa, sinónimos, trapecio y cortes de clasificación.
- `agrovia_api/cli.py`: comando `python -m agrovia_api.cli [archivo]` y ruta de ejemplo.
- `train_model.py`: las 8 variables, `OneHotEncoder`, `StandardScaler`, hiperparámetros, split y guardado del `.joblib`.
- `clean_siap.py` y `fetch_historical_nasa.py`: filtros, agregaciones, ventana junio–octubre y definición de `exito_cosecha`.
- `tests/`: **43 pruebas aprobadas** con `pytest -q` en el estado actual del repositorio.

Las brechas de ranking, rotación y `GET /api/v1/cultivos` se dejaron explícitas a propósito. No se documentaron como funcionalidades existentes.
