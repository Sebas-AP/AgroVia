"""Integration test against the real trained joblib artifact."""

from __future__ import annotations

import pytest

from agrovia_api.model_runner import ModelRunner

FEATURES = {
    "cultivo_id": "maiz_grano",
    "modalidad": "temporal",
    "cve_mun": 8,
    "lluvia_ciclo_mm": 480.0,
    "temp_media_c": 20.5,
    "temp_max_c": 27.0,
    "temp_min_extrema_c": 8.0,
    "radiacion_mj_m2": 20.0,
}


def test_real_model_predicts_probability() -> None:
    runner = ModelRunner()
    probability, predicted_class = runner.predict(FEATURES)

    assert 0.0 <= probability <= 1.0
    assert predicted_class in (0, 1)


def test_missing_feature_raises() -> None:
    runner = ModelRunner()
    incomplete = {key: value for key, value in FEATURES.items() if key != "cve_mun"}
    with pytest.raises(ValueError):
        runner.predict(incomplete)
