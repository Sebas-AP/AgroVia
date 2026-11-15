#!/usr/bin/env python3
"""Stress-test the AgroVia harvest-success model across contrasting scenarios.

Each scenario runs the 15 crops in the INIFAP catalogue through the trained
pipeline with a fixed set of agroclimatic inputs. Results are ranked by the
predicted probability of harvest success (class 1).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "modelo_agrovia.joblib"
TRAINING_DATA_PATH = BASE_DIR / "dataset_durango_final.csv"
CROPS_PATH = BASE_DIR / "datasets" / "cultivos_inifap.json"
MUNICIPALITIES_PATH = BASE_DIR / "datasets" / "municipios_durango.json"

FEATURES = [
    "cultivo_id",
    "modalidad",
    "cve_mun",
    "lluvia_ciclo_mm",
    "temp_media_c",
    "temp_max_c",
    "temp_min_extrema_c",
    "radiacion_mj_m2",
]

SCENARIOS: list[dict[str, Any]] = [
    {
        "name": "Escenario 1: Sequía severa en Los Llanos (Temporal)",
        "cve_mun": 8,
        "modalidad": "temporal",
        "lluvia_ciclo_mm": 160.0,
        "temp_media_c": 25.5,
        "temp_max_c": 32.5,
        "temp_min_extrema_c": 9.0,
        "radiacion_mj_m2": 24.0,
    },
    {
        "name": "Escenario 2: Buen temporal en Valle del Guadiana (Temporal)",
        "cve_mun": 5,
        "modalidad": "temporal",
        "lluvia_ciclo_mm": 460.0,
        "temp_media_c": 20.0,
        "temp_max_c": 26.5,
        "temp_min_extrema_c": 8.5,
        "radiacion_mj_m2": 20.5,
    },
    {
        "name": "Escenario 3: Helada temprana en zona alta / Valles (Temporal)",
        "cve_mun": 39,
        "modalidad": "temporal",
        "lluvia_ciclo_mm": 380.0,
        "temp_media_c": 15.0,
        "temp_max_c": 22.0,
        "temp_min_extrema_c": -2.5,
        "radiacion_mj_m2": 18.0,
    },
    {
        "name": "Escenario 4: Calor extremo con Riego en la Comarca Lagunera (Riego)",
        "cve_mun": 7,
        "modalidad": "riego",
        "lluvia_ciclo_mm": 140.0,
        "temp_media_c": 29.5,
        "temp_max_c": 37.5,
        "temp_min_extrema_c": 14.0,
        "radiacion_mj_m2": 25.5,
    },
    {
        "name": "Escenario 5: Exceso de lluvia / Encharcamiento en Valles del Sur",
        "cve_mun": 22,
        "modalidad": "temporal",
        "lluvia_ciclo_mm": 850.0,
        "temp_media_c": 19.5,
        "temp_max_c": 25.0,
        "temp_min_extrema_c": 9.5,
        "radiacion_mj_m2": 16.5,
    },
]

BAR_WIDTH = 25


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_training_data() -> pd.DataFrame | None:
    if not TRAINING_DATA_PATH.exists():
        return None
    return pd.read_csv(TRAINING_DATA_PATH, encoding="utf-8-sig")


def build_input_frame(scenario: dict[str, Any], crop_ids: list[str]) -> pd.DataFrame:
    rows = [
        {
            "cultivo_id": crop_id,
            "modalidad": scenario["modalidad"],
            "cve_mun": scenario["cve_mun"],
            "lluvia_ciclo_mm": scenario["lluvia_ciclo_mm"],
            "temp_media_c": scenario["temp_media_c"],
            "temp_max_c": scenario["temp_max_c"],
            "temp_min_extrema_c": scenario["temp_min_extrema_c"],
            "radiacion_mj_m2": scenario["radiacion_mj_m2"],
        }
        for crop_id in crop_ids
    ]
    return pd.DataFrame(rows, columns=FEATURES)


def success_probabilities(model: Any, frame: pd.DataFrame) -> np.ndarray:
    class_index = list(model.classes_).index(1)
    return model.predict_proba(frame)[:, class_index]


def probability_bar(probability: float) -> str:
    filled = round(probability * BAR_WIDTH)
    return "█" * filled + "░" * (BAR_WIDTH - filled)


def print_inputs(scenario: dict[str, Any], municipality: str) -> None:
    print("  Parámetros exactos de entrada al modelo:")
    print(f"    {'cve_mun':<24} {scenario['cve_mun']}  ({municipality})")
    print(f"    {'modalidad':<24} {scenario['modalidad']}")
    print(f"    {'lluvia_ciclo_mm':<24} {scenario['lluvia_ciclo_mm']:.1f}")
    print(f"    {'temp_media_c':<24} {scenario['temp_media_c']:.1f}")
    print(f"    {'temp_max_c':<24} {scenario['temp_max_c']:.1f}")
    print(f"    {'temp_min_extrema_c':<24} {scenario['temp_min_extrema_c']:.1f}")
    print(f"    {'radiacion_mj_m2':<24} {scenario['radiacion_mj_m2']:.1f}")


def print_coverage_warnings(
    scenario: dict[str, Any],
    crops: dict[str, dict[str, Any]],
    training_data: pd.DataFrame | None,
) -> None:
    if training_data is None:
        return

    modality = scenario["modalidad"]
    unsupported = [
        crop_id
        for crop_id in crops
        if training_data[
            (training_data["cultivo_id"] == crop_id)
            & (training_data["modalidad"] == modality)
        ].empty
    ]
    outside_range = [
        (
            f"{feature}={scenario[feature]:g} "
            f"(rango entrenamiento: {training_data[feature].min():.2f} "
            f"a {training_data[feature].max():.2f})"
        )
        for feature in FEATURES[3:]
        if not training_data[feature].min()
        <= scenario[feature]
        <= training_data[feature].max()
    ]

    if not unsupported and not outside_range:
        print("\n  Dominio: todas las entradas caen dentro del entrenamiento.")
        return

    print("\n  Advertencias de dominio (predicciones por extrapolación):")
    if unsupported:
        print(
            "    - Sin filas de entrenamiento para cultivo×modalidad: "
            + ", ".join(unsupported)
        )
    for warning in outside_range:
        print(f"    - Fuera de rango: {warning}")


def print_ranking(
    title: str,
    ranking: list[tuple[str, str, float]],
) -> None:
    print(f"\n  {title}")
    for position, (crop_id, crop_name, probability) in enumerate(ranking, 1):
        print(
            f"    {position:>2}. {crop_id:<18} {crop_name:<34} "
            f"{probability * 100:>5.1f}%  {probability_bar(probability)}"
        )


def run_scenario(
    model: Any,
    scenario: dict[str, Any],
    crops: dict[str, dict[str, Any]],
    municipality: str,
    training_data: pd.DataFrame | None,
) -> None:
    crop_ids = list(crops)
    frame = build_input_frame(scenario, crop_ids)
    probabilities = success_probabilities(model, frame)

    results = [
        (crop_id, crops[crop_id]["nombre"], float(probability))
        for crop_id, probability in zip(crop_ids, probabilities)
    ]
    results.sort(key=lambda item: item[2], reverse=True)

    print(f"\n{'=' * 78}")
    print(f"{scenario['name']}")
    print(f"Municipio: {municipality} (cve_mun={scenario['cve_mun']})")
    print(f"{'=' * 78}")
    print_inputs(scenario, municipality)
    print_coverage_warnings(scenario, crops, training_data)

    print_ranking("Top 5 cultivos más recomendados:", results[:5])
    print_ranking("3 cultivos con menor probabilidad:", results[-3:])


def raw_feature_name(encoded_name: str) -> str:
    encoded_name = encoded_name.split("__", 1)[-1]
    for feature in sorted(FEATURES, key=len, reverse=True):
        if encoded_name == feature or encoded_name.startswith(f"{feature}_"):
            return feature
    return encoded_name


def print_feature_importances(model: Any) -> None:
    preprocessor = model.named_steps["preprocessor"]
    classifier = model.named_steps["classifier"]
    feature_names = preprocessor.get_feature_names_out()
    importances = classifier.feature_importances_
    order = np.argsort(importances)[::-1]

    print(f"\n{'=' * 78}")
    print("Top 10 de importancia de variables (feature_importances_)")
    print(f"{'=' * 78}")
    for position, index in enumerate(order[:10], 1):
        print(
            f"  {position:>2}. {feature_names[index]:<42} "
            f"{importances[index]:>8.4f}  {probability_bar(importances[index])}"
        )

    aggregated: dict[str, float] = {}
    for name, importance in zip(feature_names, importances):
        raw = raw_feature_name(name)
        aggregated[raw] = aggregated.get(raw, 0.0) + float(importance)

    print("\n  Importancia agregada por variable original:")
    for raw, importance in sorted(
        aggregated.items(), key=lambda item: item[1], reverse=True
    ):
        print(f"    {raw:<26} {importance:>8.4f}")


def main() -> None:
    model = joblib.load(MODEL_PATH)
    crops = load_json(CROPS_PATH)
    municipalities = {
        entry["cve_mun"]: entry["municipio"]
        for entry in load_json(MUNICIPALITIES_PATH)
    }
    training_data = load_training_data()

    for scenario in SCENARIOS:
        municipality = municipalities[scenario["cve_mun"]]
        run_scenario(model, scenario, crops, municipality, training_data)

    print_feature_importances(model)


if __name__ == "__main__":
    main()
