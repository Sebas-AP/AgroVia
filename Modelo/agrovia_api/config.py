"""Runtime configuration and file locations for the AgroVia API.

Every external dependency is overridable through environment variables so the
service can be pointed at test doubles without touching the source.
"""

from __future__ import annotations

import os
from pathlib import Path

MODELO_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = MODELO_DIR.parent

DATASETS_DIR = MODELO_DIR / "datasets"
CROPS_PATH = Path(
    os.environ.get("AGROVIA_CROPS_PATH", DATASETS_DIR / "cultivos_inifap.json")
)
MUNICIPALITIES_PATH = Path(
    os.environ.get(
        "AGROVIA_MUNICIPALITIES_PATH", DATASETS_DIR / "municipios_durango.json"
    )
)
MODEL_PATH = Path(os.environ.get("AGROVIA_MODEL_PATH", MODELO_DIR / "modelo_agrovia.joblib"))

DEFAULT_PARCEL_EXAMPLE = Path(
    os.environ.get(
        "AGROVIA_PARCEL_EXAMPLE", REPO_ROOT / "Backend" / "parcela_ejemplo.json"
    )
)

NASA_POWER_URL = os.environ.get(
    "AGROVIA_NASA_POWER_URL",
    "https://power.larc.nasa.gov/api/temporal/daily/point",
)
ORNL_BASE_URL = os.environ.get(
    "AGROVIA_ORNL_BASE_URL", "https://modis.ornl.gov/rst/api/v1"
)

HTTP_TIMEOUT_SECONDS = float(os.environ.get("AGROVIA_HTTP_TIMEOUT", "90"))
# NDVI is supplementary, so it gets a short, separate timeout to fail fast.
ORNL_TIMEOUT_SECONDS = float(os.environ.get("AGROVIA_ORNL_TIMEOUT", "20"))

# MODIS/VIIRS Land Products Web Service product and band used for greenness.
ORNL_PRODUCT = "MOD13Q1"
ORNL_NDVI_BAND = "250m_16_days_NDVI"
ORNL_SUBSET_KM = 1
