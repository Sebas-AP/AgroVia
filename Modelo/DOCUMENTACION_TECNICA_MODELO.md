# Documentación Técnica — Modelo AGROVÍA

> **Módulo:** `AgroVia/Modelo/`  
> **Artefacto principal:** `modelo_agrovia.joblib`  
> **Pipeline:** `clean_siap.py` → `fetch_historical_nasa.py` → `train_model.py`  
> **Documento de producto/API:** [`README.md`](README.md)  
> **Audiencia:** evaluadores técnicos, jueces de hackatón y equipo de ciencia de datos.

---

## 1. Resumen ejecutivo

AGROVÍA entrena un clasificador binario de **éxito de cosecha** para cultivos de Durango combinando tres fuentes:

1. **SIAP**: cierres agrícolas municipales 2016–2025, usados para construir la variable objetivo y las variables de contexto.
2. **NASA POWER**: clima diario agregado al ciclo agrícola, usado como variables numéricas.
3. **INIFAP**: catálogo agronómico con umbrales ambientales, usado en una evaluación difusa paralela.

El modelo es un `Pipeline` de scikit-learn con:

- `OneHotEncoder(handle_unknown="ignore")` para `cultivo_id`, `modalidad` y `cve_mun`;
- `StandardScaler()` para cinco variables climáticas;
- `RandomForestClassifier` con `n_estimators=150`, `max_depth=8`, `class_weight="balanced"` y `random_state=42`.

El dataset actual tiene **3,690 filas**, **39 municipios**, **14 cultivos** y los años **2016–2025**. El pipeline se ajusta con el **80%** de esas filas (2,952) y se evalúa con el **20%** (738). La distribución de la clase objetivo es **873 fracasos (`0`)** y **2,817 éxitos (`1`)**.

> **Advertencia de alcance:** el motor de rotación de suelos **no está implementado** en este repositorio. La sección 7 describe las reglas agronómicas que debería implementar una extensión, pero no presenta código existente como si lo fuera. El ranking multicultivo y el endpoint `GET /api/v1/cultivos` tampoco existen; el script `test_escenarios_modelo.py` hace un ranking offline, no un contrato HTTP.

---

## 2. Pipeline de datos y reproducibilidad

### 2.1 Etapa 1 — `clean_siap.py`

**Entradas**

- Todos los CSV bajo `datasets/` que no sean archivos de salida (`siap_durango_limpio.csv`, `clima_nasa_durango.csv`, `dataset_durango_final.csv`).
- `datasets/cultivos_inifap.json`.
- `datasets/municipios_durango.json`.

**Lectura y normalización**

- Intenta `utf-8-sig` y, si falla, `latin1`.
- Normaliza nombres de columna: minúsculas, sin espacios, sin guiones y sin acentos.
- Alias conocidos: `ano`/`año` → `anio`; `sinestrada`/`sinestro` → `siniestrada`.
- Renombra `nomcultivosinum` → `nomcultivo` cuando hace falta.
- Elimina columnas duplicadas después de normalizar.
- Verifica el esquema mínimo: estado, municipio, ciclo productivo, modalidad, cultivo, sembrada, cosechada y rendimiento.

**Filtros**

| Filtro | Regla |
|---|---|
| Estado | `idestado == 10` **o** `nomestado` normalizado igual a `durango`. |
| Ciclo | `primavera-verano` o `perennes` (`VALID_CYCLES`). |
| Modalidad | `temporal` o `riego` (`VALID_MODALITIES`). |
| Cultivo | Debe mapear a una clave de `cultivos_inifap.json` mediante `nombre_siap` normalizado. |
| Municipio | `idmunicipio` entre 1 y 39; si no, se intenta por nombre. |
| Año | Entre 1900 y 2100. |
| Área | `sembrada > 0`; `cosechada` y `rendimiento` no nulos. |

**Agregación municipal**

Agrupa por:

```text
anio, cve_mun, nommunicipio, cultivo_id, modalidad
```

Suma `sembrada` y `cosechada`. El rendimiento agregado es el **rendimiento ponderado por superficie cosechada**:

\[
rendimiento_{agregado} =
\begin{cases}
\dfrac{\sum_i rendimiento_i \cdot cosechada_i}{\sum_i cosechada_i}, & \text{si } \sum_i cosechada_i > 0 \\
\text{promedio simple de } rendimiento_i, & \text{en otro caso}
\end{cases}
\]

**Salida**

`Modelo/siap_durango_limpio.csv` con columnas:

```text
anio, cve_mun, nommunicipio, cultivo_id, modalidad,
sembrada, cosechada, rendimiento, tasa_cosecha, exito_cosecha
```

**Estado actual del archivo**

| Métrica | Valor |
|---|---:|
| Filas | 3,690 |
| Años | 2016–2025 |
| Municipios | 39 |
| Cultivos | 14 |
| `exito_cosecha = 0` | 873 |
| `exito_cosecha = 1` | 2,817 |
| Modalidad `riego` | 2,048 |
| Modalidad `temporal` | 1,642 |

El catálogo tiene 15 cultivos, pero `cebada_forrajera` no aparece en el dataset limpio. Esa ausencia se propaga al modelo y se documenta en las limitaciones.

### 2.2 Etapa 2 — `fetch_historical_nasa.py`

**Entradas**

- `Modelo/siap_durango_limpio.csv`.
- `Modelo/datasets/municipios_durango.json`.
- Caché opcional `Modelo/clima_nasa_durango.csv`.

**Consulta NASA POWER**

- URL: `https://power.larc.nasa.gov/api/temporal/daily/point`.
- Comunidad: `AG` (agroclimatología).
- Coordenadas: centroide del municipio (`lat`, `lon`) del catálogo.
- Periodo: del 1 de enero del primer año al 31 de diciembre del último año solicitado.
- Parámetros:
  - `PRECTOTCORR` — precipitación corregida.
  - `T2M` — temperatura media a 2 m.
  - `T2M_MIN` — temperatura mínima a 2 m.
  - `T2M_MAX` — temperatura máxima a 2 m.
  - `ALLSKY_SFC_SW_DWN` — radiación solar de onda corta descendente.

**Ventana agrícola**

Solo se conservan los meses **junio a octubre** (`CYCLE_MONTHS = (6, 7, 8, 9, 10)`), que representan el ciclo agrícola principal de Durango.

**Agregación por año y municipio**

| Variable de salida | Cálculo |
|---|---|
| `lluvia_ciclo_mm` | Suma de `PRECTOTCORR` con `min_count=1`. |
| `temp_media_c` | Media de `T2M`. |
| `temp_max_c` | Media de `T2M_MAX` diarios. |
| `temp_min_extrema_c` | Mínimo de `T2M_MIN` diarios. |
| `radiacion_mj_m2` | Media de `ALLSKY_SFC_SW_DWN`. |

Los valores `-999` y `-999.0` se reemplazan por `NaN` antes de agregar. No se imputan valores.

**Caché y reintentos**

- Caché: `clima_nasa_durango.csv`, indexada por `(cve_mun, anio)`.
- Solo se descargan los pares municipio-año que faltan.
- Espera 0.5 s entre municipios.
- Hasta 3 intentos por municipio, con espera `2 × intento` segundos.
- Timeout de 90 s por solicitud.

**Join final**

`inner join` entre SIAP limpio y la caché climática por `(cve_mun, anio)`, con `validate="many_to_one"`.

**Salida**

`Modelo/dataset_durango_final.csv` con las 10 columnas de SIAP más las 5 variables climáticas:

```text
anio, cve_mun, nommunicipio, cultivo_id, modalidad,
sembrada, cosechada, rendimiento, tasa_cosecha, exito_cosecha,
lluvia_ciclo_mm, temp_media_c, temp_max_c,
temp_min_extrema_c, radiacion_mj_m2
```

**Estado actual**

| Métrica | Valor |
|---|---:|
| Filas | 3,690 |
| Años | 2016–2025 |
| Municipios | 39 |
| Pares municipio-año en caché | 390 (39 × 10) |
| Cultivos con datos | 14 |

### 2.3 Etapa 3 — `train_model.py`

**Entrada**

`Modelo/dataset_durango_final.csv`, leído con `encoding="utf-8-sig"`.

**Validaciones**

- Deben existir las 8 variables y la columna objetivo.
- Se eliminan filas con `NaN` en variables u objetivo.
- `exito_cosecha` se convierte a entero.
- Debe haber al menos dos clases.

**Partición**

- `train_test_split` con `test_size=0.20`.
- `stratify=y` si la clase minoritaria tiene al menos 2 filas.
- `random_state=42`.
- Si no se puede estratificar, se imprime una advertencia y se divide sin estratificación.

**Entrenamiento**

Se ajusta el `Pipeline` completo con `X_train`/`y_train`. El preprocesamiento se aprende **solo con entrenamiento**, no con test.

**Evaluación**

- `classification_report(y_test, predictions, digits=4, zero_division=0)`.
- `roc_auc_score` sobre `predict_proba(X_test)[:, 1]` si hay dos clases.
- Importancia de variables agregada del bosque.

**Salida**

`Modelo/modelo_agrovia.joblib`, guardado con `joblib.dump(..., compress=3)`. El patrón `*.joblib` está declarado para Git LFS en `.gitattributes`; el artefacto local debe añadirse con LFS al commitear.

---

## 3. Variable objetivo `exito_cosecha`

### 3.1 Definición exacta

En `clean_siap.py`, después de agregar a nivel municipal:

```python
aggregated["tasa_cosecha"] = aggregated["cosechada"] / aggregated["sembrada"]

historical_median = aggregated.groupby(
    ["cve_mun", "cultivo_id", "modalidad"]
)["rendimiento"].transform("median")

aggregated["exito_cosecha"] = (
    (aggregated["tasa_cosecha"] >= 0.80)
    & (aggregated["rendimiento"] >= 0.75 * historical_median)
).astype(int)
```

Formalmente:

\[
tasa\_cosecha = \frac{cosechada}{sembrada}
\]

\[
exito\_cosecha =
\begin{cases}
1, & \text{si } tasa\_cosecha \ge 0.80 \ \land \ rendimiento \ge 0.75 \cdot mediana_{cve\_mun, cultivo, modalidad}(rendimiento) \\
0, & \text{en otro caso}
\end{cases}
\]

### 3.2 Interpretación

- **Tasa de cosecha `>= 0.80`**: al menos el 80% de la superficie sembrada llegó a cosecha. Captura pérdidas por siniestro, abandono o fracaso del establecimiento.
- **Rendimiento `>= 75%` de la mediana histórica del grupo**: el año no solo se cosechó, sino que produjo razonablemente frente al histórico del mismo municipio, cultivo y modalidad.

La combinación evita dos falsos positivos:

1. Un año con toda la superficie cosechada pero con rendimiento muy por debajo de lo normal.
2. Un año con buen rendimiento en la poca superficie que sobrevivió, pero con pérdida masiva de área.

### 3.3 Advertencias metodológicas

- La mediana se calcula con **todos los registros del grupo**, incluido el año evaluado. Es una normalización relativa intra-grupo, no una validación temporal estrictamente prospectiva. Para un escenario de producción futuro, conviene recalcular la mediana solo con años anteriores al año objetivo.
- El objetivo mide **éxito de cosecha y rendimiento relativo**, no utilidad económica, sostenibilidad, calidad ni precio.
- La variable depende de la calidad del reporte SIAP. Un subregistro de superficie o cosecha puede cambiar la etiqueta.
- El desbalance es real: 2,817 positivos frente a 873 negativos. Por eso el clasificador usa `class_weight="balanced"`.

### 3.4 Distribución actual

| Clase | Significado | Filas | Porcentaje |
|---|---|---:|---:|
| `0` | No cumple ambos criterios | 873 | 23.7% |
| `1` | Cumple ambos criterios | 2,817 | 76.3% |
| Total | — | 3,690 | 100% |

---

## 4. Variables de entrada y preprocesamiento

### 4.1 Las 8 variables del modelo

| # | Variable | Tipo | Tratamiento | Origen |
|---:|---|---|---|---|
| 1 | `cultivo_id` | categórica | `OneHotEncoder(handle_unknown="ignore")` | Clave del catálogo INIFAP. |
| 2 | `modalidad` | categórica | `OneHotEncoder(handle_unknown="ignore")` | `temporal` o `riego`, normalizada desde `sistema_riego`. |
| 3 | `cve_mun` | categórica | `OneHotEncoder(handle_unknown="ignore")` | Municipio más cercano por Haversine. |
| 4 | `lluvia_ciclo_mm` | numérica | `StandardScaler()` | Suma NASA POWER en la ventana. |
| 5 | `temp_media_c` | numérica | `StandardScaler()` | Media NASA POWER. |
| 6 | `temp_max_c` | numérica | `StandardScaler()` | Media de máximas diarias NASA POWER. |
| 7 | `temp_min_extrema_c` | numérica | `StandardScaler()` | Mínimo de mínimas diarias NASA POWER. |
| 8 | `radiacion_mj_m2` | numérica | `StandardScaler()` | Media de radiación NASA POWER. |

La lista canónica está en `agrovia_api/model_runner.py` (`FEATURES`) y en `train_model.py` (`CATEGORICAL_FEATURES + NUMERIC_FEATURES`).

### 4.2 Variables que **no** entran al modelo

El contrato de entrada acepta y devuelve:

- `superficie_hectareas`
- `tipo_terreno`
- `tipo_suelo`
- `disponibilidad_agua`

Pero **ninguna** se usa en el Random Forest ni en el puntaje agronómico actual. Son metadatos de contexto que hoy solo se replican en la respuesta. Esto es una limitación importante: la API no modela pH, textura, materia orgánica, salinidad, pendiente ni capacidad de retención de agua.

### 4.3 Preprocesamiento exacto

```python
preprocessor = ColumnTransformer(
    transformers=[
        (
            "categorical",
            OneHotEncoder(handle_unknown="ignore"),
            ["cultivo_id", "modalidad", "cve_mun"],
        ),
        (
            "numeric",
            StandardScaler(),
            [
                "lluvia_ciclo_mm",
                "temp_media_c",
                "temp_max_c",
                "temp_min_extrema_c",
                "radiacion_mj_m2",
            ],
        ),
    ]
)
```

- **OneHotEncoder**: crea una columna binaria por categoría. Con `handle_unknown="ignore"`, una categoría no vista en entrenamiento se codifica como todas las columnas en cero. Esto permite que la API acepte `cebada_forrajera`, pero su predicción es extrapolación.
- **StandardScaler**: centra y escala las cinco variables numéricas con media y desviación estándar aprendidas en entrenamiento.
- **Sin imputación en el pipeline**: el entrenamiento elimina filas con `NaN`; en inferencia, el cliente NASA lanza error si no hay datos utilizables, por lo que las cinco numéricas llegan completas. `ModelRunner` lanza `ValueError` si falta una variable.
- **60 columnas codificadas** en el artefacto actual:
  - 14 categorías de cultivo (no 15, porque `cebada_forrajera` no está en entrenamiento).
  - 2 categorías de modalidad.
  - 39 categorías de municipio.
  - 5 variables numéricas.
  - Total: 14 + 2 + 39 + 5 = 60.

### 4.4 Ingeniería de variables

No hay ingeniería de variables adicional. El modelo usa exactamente los agregados de NASA POWER y las tres categóricas. No se construyen índices de sequía, acumulados térmicos, días de helada, déficit hídrico ni variables fenológicas. La etapa de crecimiento **no** entra al modelo; solo define la ventana de consulta climática y de NDVI.

---

## 5. Modelo Random Forest

### 5.1 Hiperparámetros utilizados

`train_model.py` construye:

```python
RandomForestClassifier(
    n_estimators=150,
    max_depth=8,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
```

| Hiperparámetro | Valor | Efecto |
|---|---:|---|
| `n_estimators` | 150 | Número de árboles. |
| `max_depth` | 8 | Profundidad máxima; controla complejidad. |
| `class_weight` | `"balanced"` | Pondera clases inversamente a su frecuencia. |
| `random_state` | 42 | Reproducibilidad. |
| `n_jobs` | -1 | Usa todos los núcleos disponibles. |
| `criterion` | `gini` | Default de scikit-learn. |
| `max_features` | `sqrt` | Default para clasificación. |
| `min_samples_split` | 2 | Default. |
| `min_samples_leaf` | 1 | Default. |
| `bootstrap` | `True` | Default. |
| `oob_score` | `False` | Default. |

**No hay búsqueda de hiperparámetros** (`GridSearchCV`, `RandomizedSearchCV` u Optuna) ni validación cruzada en `train_model.py`. Los valores son fijos. Tampoco hay calibración de probabilidades (`CalibratedClassifierCV`). La probabilidad devuelta es la fracción de votos del bosque, no una probabilidad calibrada.

### 5.2 Predicción en inferencia

`agrovia_api/model_runner.py`:

1. Verifica que estén las 8 variables.
2. Construye un `DataFrame` de una fila con el orden canónico.
3. Llama `model.predict_proba(frame)[0]`.
4. Busca el índice de la clase `1` (`SUCCESS_CLASS = 1`).
5. Devuelve `(probabilidad_clase_1, clase_predicha)`.
6. `clase_predicha` es `argmax` de las probabilidades, no un umbral manual.

### 5.3 Clasificación cualitativa

`classify_probability()` usa:

| Probabilidad | Etiqueta |
|---|---|
| `>= 0.66` | `alto` |
| `>= 0.33` y `< 0.66` | `medio` |
| `< 0.33` | `bajo` |

Estos cortes son de presentación, no del modelo. No cambian la clase predicha.

### 5.4 Métricas y trazabilidad

`train_model.py` imprime, en cada entrenamiento:

- tamaño de entrenamiento y prueba;
- distribución de clases;
- `classification_report` con precisión, recall, F1 y soporte;
- `ROC AUC` si hay dos clases;
- importancias de variables codificadas.

No se guardan métricas en un archivo de experimentos ni se versionan con MLflow. Para reproducir un resultado hay que conservar el dataset, el código y la salida de consola. Se recomienda registrar esas métricas en el commit o en un archivo de experimento si se va a comparar modelos.

### 5.5 Interpretación de importancias

El script `train_model.py` y `test_escenarios_modelo.py` imprimen:

- importancia por columna codificada (`categorical__...`, `numeric__...`);
- importancia agregada por variable original en `test_escenarios_modelo.py`.

Las importancias del Random Forest son **asociativas**, no causales. Que `lluvia_ciclo_mm` tenga alta importancia no implica que modificar el riego vaya a cambiar el resultado en la misma proporción.

---

## 6. Evaluación agronómica difusa (INIFAP)

### 6.1 Trapecio

Cada cultivo del catálogo define cuatro límites `[a, b, c, d]` por variable:

- por debajo de `a`: puntaje `0`;
- entre `a` y `b`: rampa lineal de `0` a `1`;
- entre `b` y `c`: meseta de `1`;
- entre `c` y `d`: rampa lineal de `1` a `0`;
- por encima de `d`: puntaje `0`.

Implementación en `agrovia_api/agronomy.py`:

```python
def trapezoid_score(value: float, thresholds: list[float]) -> float:
    a, b, c, d = (float(limit) for limit in thresholds)
    if value < a or value > d:
        return 0.0
    if value < b:
        return (value - a) / (b - a) if b != a else 1.0
    if value <= c:
        return 1.0
    return (d - value) / (d - c) if d != c else 1.0
```

### 6.2 Variables y mapeo

`TRAPEZOID_KEYS` y `TRAPEZOID_FEATURE` en `service.py`:

| Variable del catálogo | Variable climática usada |
|---|---|
| `lluvia_mm` | `lluvia_ciclo_mm` |
| `temp_media_c` | `temp_media_c` |
| `temp_min_ciclo_c` | `temp_min_extrema_c` |
| `radiacion_mj_m2` | `radiacion_mj_m2` |

Cada cultivo del catálogo tiene los cuatro trapecios. Si faltara uno, se omite del promedio; si no hay ninguno, el puntaje global es `0.0`.

### 6.3 Agregación y clasificación

\[
puntaje\_global = \frac{1}{n}\sum_{i=1}^{n} puntaje_i
\]

con `n = 4` en la práctica. Todos los trapecios pesan igual. No hay pesos por cultivo, por variable ni por etapa.

| Puntaje global | Clasificación |
|---|---|
| `>= 0.80` | `optimo` |
| `>= 0.60` | `adecuado` |
| `>= 0.40` | `marginal` |
| `< 0.40` | `inadecuado` |

### 6.4 Relación con el Random Forest

La evaluación difusa **no alimenta** al Random Forest. Son dos salidas paralelas:

- El bosque responde “¿qué probabilidad hay de que este cultivo, en este municipio y modalidad, con este clima, tenga éxito de cosecha según el histórico?”.
- La lógica difusa responde “¿qué tan lejos está este clima de la ventana óptima que reporta el catálogo INIFAP para este cultivo?”.

No se suman, no se promedian y no se ponderan entre sí en el código actual. Cualquier índice conjunto sería una decisión de producto nueva.

---

## 7. Motor de rotación de suelos: estado y reglas propuestas

### 7.1 Estado actual

**No implementado.** En el repositorio no existe:

- módulo `rotation.py` ni equivalente;
- endpoint de plan de rotación;
- campo `plan_rotacion` en `RespuestaEvaluacion`;
- historial de cultivos por parcela;
- cálculo de dos ciclos;
- pesos o penalizaciones de rotación en `service.py`.

El catálogo sí aporta la materia prima:

- `familia`: `leguminosa`, `graminea`, `asteracea`, `malvacea`, `solanacea`, `rosacea`, `juglandacea`.
- `notas_tecnicas`: observaciones agronómicas por cultivo.
- `duracion_ciclo_dias`, `ciclo_principal`, `modalidad_recomendada`.

### 7.2 Reglas agronómicas que debería implementar la extensión

Las siguientes reglas son **diseño agronómico propuesto**, no comportamiento actual:

#### Leguminosas: fijación de nitrógeno

Cultivos actuales: `frijol_pinto`, `alfalfa`, `garbanzo`.

- La simbiosis con rizobios fija nitrógeno atmosférico y deja un crédito de nitrógeno para el siguiente ciclo.
- Deben recibir un **bonus** como cultivo precedente de gramíneas de alta demanda.
- No conviene repetir leguminosa tras leguminosa en el mismo lote si hay riesgo de enfermedades de raíz o de nematodos.
- `alfalfa` es perenne (365 días); su terminación y descanso del lote deben modelarse aparte, no como rotación anual simple.

#### Gramíneas: extracción de nutrientes

Cultivos actuales: `maiz_grano`, `maiz_forrajero`, `avena_forrajera`, `sorgo_forrajero`, `sorgo_grano`, `trigo_grano`, `cebada_forrajera`.

- Alta demanda de nitrógeno, agua y, en algunos casos, azufre.
- Deben **penalizarse** si se repiten en ciclos consecutivos o si siguen a otra gramínea.
- Deben recibir un **bonus** si siguen a una leguminosa o a un periodo de descanso.
- El manejo de rastrojo importa: retirarlo o quemarlo reduce el retorno de materia orgánica.

#### Asteráceas: descompactación y exploración profunda

Cultivo actual: `girasol`.

- Raíz pivotante profunda que puede explorar capas compactadas y reciclar nutrientes.
- Buen cultivo “rompe-ciclo” después de gramíneas.
- No conviene repetirlo de forma consecutiva por presión de enfermedades del suelo (por ejemplo, esclerotinia) y por su bajo aporte de rastrojo.
- Debe recibir un **bonus** como precedente de gramíneas y una **penalización** por monocultivo.

#### Otras familias

- `algodon` (malvacea): rotar para reducir presión de enfermedades y plagas; no es un cultivo de rotación anual ideal para todos los suelos.
- `chile_verde` (solanacea): alta presión fitosanitaria; evitar repetición y evitar seguir de otras solanáceas.
- `manzana` (rosacea) y `nuez_pecanera` (juglandacea): perennes; no participan de una rotación anual de dos ciclos. Deben excluirse del motor de rotación anual o modelarse como cultivos permanentes con otra lógica.

#### Penalización por monocultivo

- Mismo `cultivo_id` en ciclos consecutivos: **penalización alta**.
- Misma `familia` en ciclos consecutivos: **penalización media**.
- Tres o más ciclos consecutivos de la misma familia: **penalización severa**.
- Rotación con leguminosa, asterácea o descanso: **bonus**.
- El objetivo no es solo “variar por variedad”, sino romper ciclos de plagas, enfermedades, malezas y agotamiento de nutrientes.

### 7.3 Algoritmo propuesto (no implementado)

Un motor de rotación a dos ciclos podría operar así:

```text
Entrada:
  perfil de parcela + cultivo_actual + clima del ciclo + catálogo

1. Construir candidatos:
   - cultivos compatibles con modalidad, ciclo y catálogo;
   - excluir perennes del ciclo anual;
   - calcular puntaje climático difuso y probabilidad Random Forest
     para cada candidato con el clima actual.

2. Aplicar reglas de rotación:
   - penalizar mismo cultivo y misma familia;
   - bonificar leguminosa como precedente de gramínea;
   - bonificar asterácea como rompe-ciclo;
   - penalizar repetición de solanácea/malvácea;
   - considerar `tipo_suelo` y `disponibilidad_agua` cuando exista
     una capa de reglas específica (hoy no existe).

3. Ordenar candidatos y elegir el mejor para el ciclo 1.

4. Actualizar el estado del lote con el cultivo elegido.

5. Repetir para el ciclo 2, aplicando las mismas reglas y el nuevo
   cultivo precedente.

6. Devolver:
   - ranking de cultivos;
   - plan de dos ciclos con justificación;
   - advertencias y supuestos.
```

Este pseudocódigo es una **propuesta de arquitectura**. No debe presentarse como funcionalidad existente. Para implementarlo harían falta, como mínimo:

- un módulo nuevo de rotación;
- un esquema de entrada con historial de cultivos;
- un esquema de salida con ranking y plan;
- pruebas unitarias de reglas y pruebas de contrato;
- validación agronómica con técnicos y datos de rotación reales;
- calibración de pesos con evidencia local, no pesos inventados.

### 7.4 Por qué no se inventaron pesos

No hay en el repositorio datos de experimentos de rotación, ensayos de largo plazo ni historial de lotes que permitan estimar el efecto de una leguminosa, una gramínea o una asterácea sobre el rendimiento siguiente. Asignar pesos numéricos sin esa evidencia sería fabricar resultados. Por eso este documento describe reglas cualitativas y un algoritmo propuesto, pero no afirma que exista un modelo de rotación calibrado.

---

## 8. Limitaciones y validez

### 8.1 Escala espacial

- **NASA POWER**: ~50 km de resolución. El clima es regional, no de parcela.
- **MODIS NDVI**: 250 m por píxel, compuesto de 16 días. El cliente toma el píxel central de una submuestra de 1 km.
- **Modelo**: entrenado con clima de centroides municipales y agregados SIAP municipales. La inferencia usa la coordenada de la parcela para NASA POWER, lo que introduce un posible desajuste de distribución.
- **Municipio**: se asigna por centroide más cercano con Haversine (`EARTH_RADIUS_KM = 6371.0088`). Un predio cerca de un límite municipal puede quedar asignado al municipio equivocado.

### 8.2 Escala temporal

- El clima histórico se agrega solo de **junio a octubre**. Cultivos de otoño-invierno o perennes pueden no estar bien representados por esa ventana.
- La ventana de inferencia depende de la etapa declarada y del ciclo máximo del catálogo, no de observaciones fenológicas reales.
- La validación es una partición aleatoria 80/20, no una validación temporal por año. Un split aleatorio puede mezclar años y sobreestimar la capacidad de generalización a un año nuevo. Para una evaluación prospectiva estricta, usar un split temporal (entrenar con años anteriores y probar con el año siguiente) o `GroupKFold` por año.

### 8.3 Cobertura de datos

- 3,690 filas, 39 municipios, 14 cultivos, 10 años.
- `cebada_forrajera`: 0 filas.
- `girasol`: 8 filas; `garbanzo`: 2; `algodon`: 30. Las probabilidades para estos cultivos son inestables.
- El desbalance 873/2,817 se mitiga con `class_weight="balanced"`, pero no desaparece.
- No hay datos de variedad, densidad de siembra, fertilización, riego aplicado, plagas, labranza, pendiente ni precio.

### 8.4 Calibración y métricas

- No hay calibración de probabilidades. `predict_proba` del Random Forest es una proporción de votos, no una probabilidad frecuentista calibrada.
- No hay búsqueda de hiperparámetros ni validación cruzada en el script.
- No hay pruebas de robustez ante valores extremos, datos faltantes o cambios de distribución.
- Las importancias de variables son asociativas, no causales.

### 8.5 Suelo y manejo

- `tipo_suelo`, `tipo_terreno` y `disponibilidad_agua` no participan del modelo ni del puntaje.
- No hay análisis físico-químico, capacidad de campo, punto de marchitez, pH, materia orgánica, salinidad ni profundidad efectiva.
- La recomendación es una señal de apoyo; no reemplaza la evaluación de suelo ni la decisión del técnico.

### 8.6 NDVI

- No alimenta al modelo.
- Su fallo se degrada a `ndvi=null` con advertencia.
- El compuesto de 16 días puede no alinearse con eventos fenológicos puntuales.
- El píxel central puede no representar toda la parcela.

---

## 9. Reentrenamiento paso a paso

### 9.1 Preparación

Desde `Modelo/`:

```bash
cd Modelo
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pytest ruff
```

`pytest` y `ruff` no están en `requirements.txt`; se instalan aparte para desarrollo y pruebas.

Si se clonó el repositorio sin LFS:

```bash
git lfs install
git lfs pull
```

### 9.2 Reentrenamiento estándar

```bash
python clean_siap.py
python fetch_historical_nasa.py
python train_model.py
pytest -q
```

Orden obligatorio:

1. `clean_siap.py` genera `siap_durango_limpio.csv`.
2. `fetch_historical_nasa.py` genera/actualiza la caché y `dataset_durango_final.csv`.
3. `train_model.py` entrena y sobrescribe `modelo_agrovia.joblib`.

### 9.3 Agregar nuevos años

1. Colocar el CSV crudo de SIAP en `datasets/` o en una subcarpeta de `datasets/`.
2. Mantener el esquema esperado: estado, municipio, ciclo productivo, modalidad, cultivo, sembrada, cosechada y rendimiento.
3. Ejecutar `python clean_siap.py`.
4. Ejecutar `python fetch_historical_nasa.py`. La caché es incremental: solo descarga los pares `(cve_mun, anio)` que falten.
5. Ejecutar `python train_model.py`.
6. Ejecutar `pytest -q` y una evaluación de humo con `python -m agrovia_api.cli mi_parcela.json`.

Notas:

- Si el nuevo año tiene municipios sin coordenadas en `municipios_durango.json`, `fetch_historical_nasa.py` emitirá una advertencia y omitirá esos pares.
- Si un año no tiene datos de junio–octubre, NASA POWER puede devolver un frame vacío y el par quedará fuera del join.
- La caché no se invalida automáticamente si NASA POWER corrige datos históricos. Para forzar una recarga, borrar las filas correspondientes de `clima_nasa_durango.csv` o el archivo completo.

### 9.4 Agregar nuevos cultivos

1. Agregar una entrada en `datasets/cultivos_inifap.json` con:
   - `nombre`
   - `nombre_siap` (debe coincidir, normalizado, con el nombre que usa SIAP)
   - `familia`
   - `ciclo_principal`
   - `modalidad_recomendada`
   - `duracion_ciclo_dias`
   - `ventana_siembra_meses`
   - `lluvia_mm`, `temp_media_c`, `temp_min_ciclo_c`, `radiacion_mj_m2` (trapecios de 4 límites)
   - `suelo_ph`
   - `notas_tecnicas`
2. Verificar que existan filas SIAP para ese cultivo. Si no existen, el modelo no aprenderá la categoría; `OneHotEncoder(handle_unknown="ignore")` la tratará como desconocida.
3. Ejecutar `python clean_siap.py`, `python fetch_historical_nasa.py` y `python train_model.py`.
4. Agregar pruebas de contrato si el catálogo cambia.

Advertencia: agregar un cultivo al catálogo **no** garantiza que el modelo lo recomiende con evidencia. Sin filas de entrenamiento, la predicción es extrapolación.

### 9.5 Agregar nuevos municipios

1. Agregar a `datasets/municipios_durango.json`:
   ```json
   {
     "cve_mun": 40,
     "municipio": "Nombre",
     "lat": 24.0,
     "lon": -104.0
   }
   ```
2. Verificar que SIAP use el mismo nombre o la misma clave.
3. Ejecutar el pipeline completo.

Nota técnica: `clean_siap.py` acepta `idmunicipio` numérico entre 1 y 39 y, si está fuera de ese rango, intenta mapear por nombre. Si se agrega un municipio con `cve_mun > 39`, conviene asegurar que el nombre coincida exactamente (normalizado) para que el mapeo por nombre funcione. Si no, las filas se descartan.

### 9.6 Cambiar la ruta del modelo

`agrovia_api/config.py` permite:

```bash
export AGROVIA_MODEL_PATH=/ruta/a/modelo_agrovia.joblib
```

También se pueden cambiar `AGROVIA_CROPS_PATH`, `AGROVIA_MUNICIPALITIES_PATH` y `AGROVIA_PARCEL_EXAMPLE`.

### 9.7 Verificación posterior

```bash
pytest -q
python -m agrovia_api.cli mi_parcela.json
python test_escenarios_modelo.py
```

- `pytest -q` debe pasar (43 pruebas en el estado actual).
- El CLI debe devolver un JSON válido con `evaluacion_modelo`, `evaluacion_agronomica` y `advertencias`.
- `test_escenarios_modelo.py` debe imprimir rankings por escenario; si un escenario queda fuera del rango de entrenamiento, el script lo advierte.

### 9.8 Git LFS

`modelo_agrovia.joblib` está cubierto por `.gitattributes`:

```text
*.joblib filter=lfs diff=lfs merge=lfs -text
```

Después de reentrenar:

```bash
git lfs status
git add modelo_agrovia.joblib
git commit -m "chore: retrain harvest-success model with <years/crops>"
```

No agregar tipos de archivo de pesos nuevos sin declararlos antes en `.gitattributes` (regla de `Modelo/AGENTS.md`).

### 9.9 Reproducibilidad

- El script usa `random_state=42` en el split y en el bosque.
- La reproducibilidad depende de conservar `siap_durango_limpio.csv`, `clima_nasa_durango.csv`, `dataset_durango_final.csv` y los catálogos JSON. En el estado actual del working tree varios de esos archivos no están trackeados en Git; antes de un despliegue conviene versionarlos (y usar LFS para el `.joblib`).
- Las dependencias de `requirements.txt` usan mínimos (`>=`), no versiones exactas. Para reproducibilidad estricta, fijar versiones con un lockfile o un `requirements-frozen.txt`.
- No hay semilla para el orden de los datos más allá del split; el orden de `pandas` es determinista para los mismos archivos de entrada.
- No hay registro automático de métricas; guardar la salida de `train_model.py` junto al commit.

---

## 10. Trazabilidad código-documento

| Afirmación documentada | Archivo / función |
|---|---|
| Endpoints, manejo de errores y versión | `agrovia_api/main.py` |
| Contrato de entrada/salida | `agrovia_api/schemas.py` |
| Orquestación, validaciones y advertencias | `agrovia_api/service.py` |
| Trapecios, etapas y ventana | `agrovia_api/agronomy.py` |
| 8 variables y carga del joblib | `agrovia_api/model_runner.py` |
| Agregación NASA POWER y fill values | `agrovia_api/clients/nasa_power.py` |
| MOD13Q1, NDVI y degradación | `agrovia_api/clients/ornl_modis.py` |
| Rutas, URLs y timeouts | `agrovia_api/config.py` |
| Haversine y municipio más cercano | `agrovia_api/geo.py` |
| Catálogos | `agrovia_api/catalogs.py`, `datasets/*.json` |
| Limpieza SIAP y target | `clean_siap.py` |
| Clima histórico y dataset maestro | `fetch_historical_nasa.py` |
| Pipeline, hiperparámetros y métricas | `train_model.py` |
| Pruebas offline | `tests/`, `tests/fakes.py` |
| Ranking offline (no endpoint) | `test_escenarios_modelo.py` |
| Demo de cultivos (no endpoint) | `probar_modelo.py` |

---

## 11. Referencias

- SIAP — Servicio de Información Agroalimentaria y Pesquera: <https://www.gob.mx/siap>
- INIFAP — Instituto Nacional de Investigaciones Forestales, Agrícolas y Pecuarias: <https://www.gob.mx/inifap>
- NASA POWER — Prediction Of Worldwide Energy Resources: <https://power.larc.nasa.gov/>
- ORNL DAAC — Oak Ridge National Laboratory Distributed Active Archive Center: <https://daac.ornl.gov/>
- Servicio web MODIS/VIIRS de ORNL DAAC: <https://modis.ornl.gov/rst/api/v1>
- Producto MOD13Q1 (MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m): <https://lpdaac.usgs.gov/products/mod13q1v061/>
- scikit-learn — RandomForestClassifier y Pipeline: <https://scikit-learn.org/stable/modules/ensemble.html#random-forests>

---

## 12. Conclusión técnica

El repositorio contiene un pipeline reproducible de ciencia de datos que:

- limpia SIAP y construye un objetivo binario defendible;
- integra clima NASA POWER por municipio y año;
- entrena un Random Forest con preprocesamiento explícito y semilla fija;
- evalúa el mismo perfil con reglas agronómicas INIFAP en paralelo;
- expone un contrato FastAPI claro y una degradación elegante cuando NDVI falla.

Lo que **no** contiene es un motor de rotación calibrado, un ranking multicultivo expuesto por API ni un índice híbrido ponderado. Documentarlo de otra forma sería atribuir al código una capacidad que no tiene. La transparencia sobre estas brechas es parte de la validez técnica del entregable.
