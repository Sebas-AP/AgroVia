import json
from pathlib import Path

import joblib
import pandas as pd

# 1. Cargar el modelo entrenado y el catálogo de cultivos
BASE_DIR = Path(__file__).resolve().parent
modelo = joblib.load(BASE_DIR / "modelo_agrovia.joblib")

with open(BASE_DIR / "datasets" / "cultivos_inifap.json", "r", encoding="utf-8") as f:
    cultivos = json.load(f)

# Seleccionamos los cultivos principales de temporal para comparar
cultivos_prueba = [
    "frijol_pinto",
    "maiz_grano",
    "avena_forrajera",
    "sorgo_forrajero",
    "girasol"
]

def simular_escenario(nombre_escenario: str, cve_mun: int, modalidad: str, clima: dict):
    print(f"\n{'='*60}")
    print(f"🌱 ESCENARIO: {nombre_escenario}")
    print(f"   Municipio ID: {cve_mun} | Modalidad: {modalidad.upper()}")
    print(f"   Lluvia: {clima['lluvia_ciclo_mm']} mm | Temp Media: {clima['temp_media_c']} °C")
    print(f"{'='*60}")

    filas = []
    for cid in cultivos_prueba:
        filas.append({
            "cultivo_id": cid,
            "modalidad": modalidad,
            "cve_mun": cve_mun,
            "lluvia_ciclo_mm": clima["lluvia_ciclo_mm"],
            "temp_media_c": clima["temp_media_c"],
            "temp_max_c": clima["temp_max_c"],
            "temp_min_extrema_c": clima["temp_min_extrema_c"],
            "radiacion_mj_m2": clima["radiacion_mj_m2"],
        })

    df_test = pd.DataFrame(filas)
    
    # Predecir probabilidad de éxito (clase 1)
    probabilidades = modelo.predict_proba(df_test)[:, 1]
    
    resultados = []
    for cid, prob in zip(cultivos_prueba, probabilidades):
        nombre_legible = cultivos[cid]["nombre"]
        resultados.append((nombre_legible, round(prob * 100, 1)))

    # Ordenar de mayor a menor probabilidad
    resultados.sort(key=lambda x: x[1], reverse=True)

    for i, (nombre, porcentaje) in enumerate(resultados, 1):
        barra = "█" * int(porcentaje // 5)
        print(f"  {i}. {nombre:<32} {porcentaje:>5}%  {barra}")

# 2. Ejecutar las dos simulaciones en Guadalupe Victoria (cve_mun = 8)
clima_sequia = {
    "lluvia_ciclo_mm": 180.0,      # Muy poca lluvia
    "temp_media_c": 25.5,          # Calor alto
    "temp_max_c": 32.0,
    "temp_min_extrema_c": 9.0,
    "radiacion_mj_m2": 23.5
}

clima_buen_temporal = {
    "lluvia_ciclo_mm": 480.0,      # Lluvia ideal de verano
    "temp_media_c": 20.5,          # Clima templado
    "temp_max_c": 27.0,
    "temp_min_extrema_c": 8.0,
    "radiacion_mj_m2": 20.0
}

simular_escenario("SEQUÍA SEVERA EN LOS LLANOS", cve_mun=8, modalidad="temporal", clima=clima_sequia)
simular_escenario("BUEN TEMPORAL DE LLUVIAS", cve_mun=8, modalidad="temporal", clima=clima_buen_temporal)
