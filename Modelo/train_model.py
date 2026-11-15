#!/usr/bin/env python3
"""Train the AgroVia harvest-success model for Durango."""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "dataset_durango_final.csv"
MODEL_PATH = BASE_DIR / "modelo_agrovia.joblib"

CATEGORICAL_FEATURES = ["cultivo_id", "modalidad", "cve_mun"]
NUMERIC_FEATURES = [
    "lluvia_ciclo_mm",
    "temp_media_c",
    "temp_max_c",
    "temp_min_extrema_c",
    "radiacion_mj_m2",
]
TARGET = "exito_cosecha"
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
        ]
    )
    classifier = RandomForestClassifier(
        n_estimators=150,
        max_depth=8,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )


def print_feature_importances(pipeline: Pipeline) -> None:
    preprocessor: ColumnTransformer = pipeline.named_steps["preprocessor"]
    classifier: RandomForestClassifier = pipeline.named_steps["classifier"]
    feature_names = preprocessor.get_feature_names_out()
    importances = classifier.feature_importances_
    order = np.argsort(importances)[::-1]

    print("\nFeature importances:")
    print(f"{'Feature':<40} {'Importance':>12}")
    print("-" * 54)
    for index in order:
        print(f"{feature_names[index]:<40} {importances[index]:>12.6f}")


def main() -> None:
    if not DATASET_PATH.exists():
        raise SystemExit(
            f"Master dataset not found: {DATASET_PATH}. "
            "Run fetch_historical_nasa.py first."
        )

    data = pd.read_csv(DATASET_PATH, encoding="utf-8-sig")
    missing_columns = set(FEATURES + [TARGET]) - set(data.columns)
    if missing_columns:
        raise SystemExit(
            "Dataset is missing required columns: "
            + ", ".join(sorted(missing_columns))
        )

    data = data.dropna(subset=FEATURES + [TARGET]).copy()
    data[TARGET] = data[TARGET].astype(int)

    if data[TARGET].nunique() < 2:
        raise SystemExit(
            "Target exito_cosecha contains a single class; cannot train a classifier"
        )

    X = data[FEATURES]
    y = data[TARGET]
    print(f"Training rows: {len(data)}")
    print(f"Class distribution:\n{y.value_counts().sort_index().to_string()}")

    class_counts = y.value_counts()
    stratify = y if int(class_counts.min()) >= 2 else None
    if stratify is None:
        print("Warning: a class has fewer than 2 rows; disabling stratification")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        stratify=stratify,
        random_state=42,
    )
    print(f"Train rows: {len(X_train)} | Test rows: {len(X_test)}")

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    predictions = pipeline.predict(X_test)
    print("\nClassification report:")
    print(classification_report(y_test, predictions, digits=4, zero_division=0))

    try:
        probabilities = pipeline.predict_proba(X_test)[:, 1]
        print(f"ROC AUC: {roc_auc_score(y_test, probabilities):.4f}")
    except ValueError as exc:
        print(f"ROC AUC could not be computed: {exc}")

    print_feature_importances(pipeline)

    joblib.dump(pipeline, MODEL_PATH, compress=3)
    print(f"\nModel pipeline saved to {MODEL_PATH.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
