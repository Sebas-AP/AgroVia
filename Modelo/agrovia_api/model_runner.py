"""Adapter around the trained scikit-learn harvest-success pipeline."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from .config import MODEL_PATH

FEATURES = (
    "cultivo_id",
    "modalidad",
    "cve_mun",
    "lluvia_ciclo_mm",
    "temp_media_c",
    "temp_max_c",
    "temp_min_extrema_c",
    "radiacion_mj_m2",
)
SUCCESS_CLASS = 1


def classify_probability(probability: float) -> str:
    """Bucket the harvest-success probability into a readable label."""
    if probability >= 0.66:
        return "alto"
    if probability >= 0.33:
        return "medio"
    return "bajo"


class ModelRunner:
    """Lazily loads the joblib pipeline and predicts success probabilities."""

    def __init__(self, model_path: Path | str = MODEL_PATH) -> None:
        self._model_path = Path(model_path)
        self._model: Any | None = None

    @property
    def model_path(self) -> Path:
        return self._model_path

    def _load(self) -> Any:
        if self._model is None:
            if not self._model_path.exists():
                raise FileNotFoundError(
                    f"Trained model not found: {self._model_path}"
                )
            self._model = joblib.load(self._model_path)
        return self._model

    def predict(self, features: Mapping[str, object]) -> tuple[float, int]:
        """Return ``(probability_of_success, predicted_class)``."""
        model = self._load()
        missing = [name for name in FEATURES if name not in features]
        if missing:
            raise ValueError(
                "Missing model features: " + ", ".join(sorted(missing))
            )

        frame = pd.DataFrame(
            [{name: features[name] for name in FEATURES}], columns=list(FEATURES)
        )
        probabilities = model.predict_proba(frame)[0]
        classes = list(model.classes_)
        success_index = classes.index(SUCCESS_CLASS)
        probability = float(probabilities[success_index])
        predicted_class = int(classes[int(probabilities.argmax())])
        return probability, predicted_class
