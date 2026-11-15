#!/usr/bin/env python3
"""Clean SIAP agricultural closure data for Durango.

Reads every raw SIAP CSV found under datasets/, normalizes the schema, keeps
Durango records for temporal/riego under Primavera-Verano and Perennes, maps
crops to the INIFAP catalog, and derives the binary harvest-success target.
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "datasets"
CULTIVOS_PATH = DATASETS_DIR / "cultivos_inifap.json"
MUNICIPIOS_PATH = DATASETS_DIR / "municipios_durango.json"
OUTPUT_PATH = BASE_DIR / "siap_durango_limpio.csv"

OUTPUT_FILENAMES = {
    "siap_durango_limpio.csv",
    "clima_nasa_durango.csv",
    "dataset_durango_final.csv",
}
COLUMN_ALIASES = {
    "ano": "anio",
    "año": "anio",
    "sinestrada": "siniestrada",
    "sinestro": "siniestrada",
}
VALID_CYCLES = {"primavera-verano", "perennes"}
VALID_MODALITIES = {"temporal", "riego"}
REQUIRED_SCHEMA = (
    ("idestado", "nomestado"),
    ("idmunicipio", "nommunicipio"),
    ("nomcicloproductivo",),
    ("nommodalidad",),
    ("nomcultivo",),
    ("sembrada",),
    ("cosechada",),
    ("rendimiento",),
)


def strip_accents(text: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(char)
    )


def normalize_label(value: object) -> str:
    if pd.isna(value):
        return ""
    text = strip_accents(str(value)).lower().strip()
    return " ".join(text.split())


def normalize_column_name(name: object) -> str:
    text = str(name).strip().lower().replace(" ", "").replace("-", "")
    text = strip_accents(text)
    return COLUMN_ALIASES.get(text, text)


def read_csv_with_fallback(path: Path) -> pd.DataFrame | None:
    for encoding in ("utf-8-sig", "latin1"):
        try:
            frame = pd.read_csv(path, encoding=encoding, dtype=str, low_memory=False)
        except UnicodeDecodeError:
            continue
        except Exception as exc:  # noqa: BLE001 - skip unreadable files, keep going
            print(f"  ! Could not read {path.name} ({encoding}): {exc}")
            continue

        frame.columns = [normalize_column_name(column) for column in frame.columns]
        if frame.columns.duplicated().any():
            frame = frame.loc[:, ~frame.columns.duplicated()]
        if "nomcultivo" not in frame.columns and "nomcultivosinum" in frame.columns:
            frame = frame.rename(columns={"nomcultivosinum": "nomcultivo"})
        return frame
    return None


def has_required_schema(frame: pd.DataFrame) -> bool:
    return all(
        any(column in frame.columns for column in group)
        for group in REQUIRED_SCHEMA
    )


def series_or_empty(frame: pd.DataFrame, column: str) -> pd.Series:
    if column in frame.columns:
        return frame[column]
    return pd.Series(pd.NA, index=frame.index, dtype="object")


def load_crop_catalog() -> dict[str, str]:
    with CULTIVOS_PATH.open(encoding="utf-8") as handle:
        catalog = json.load(handle)

    crop_map: dict[str, str] = {}
    for crop_id, metadata in catalog.items():
        label = normalize_label(metadata.get("nombre_siap", ""))
        if not label:
            continue
        if label in crop_map:
            print(f"  ! Duplicate nombre_siap '{metadata['nombre_siap']}' in catalog")
        crop_map[label] = crop_id
    return crop_map


def load_municipalities() -> tuple[dict[int, str], dict[str, int]]:
    with MUNICIPIOS_PATH.open(encoding="utf-8") as handle:
        municipalities = json.load(handle)

    by_id = {int(item["cve_mun"]): item["municipio"] for item in municipalities}
    by_name = {
        normalize_label(item["municipio"]): int(item["cve_mun"])
        for item in municipalities
    }
    return by_id, by_name


def aggregate_to_municipality_level(frame: pd.DataFrame) -> pd.DataFrame:
    group_keys = ["anio", "cve_mun", "nommunicipio", "cultivo_id", "modalidad"]
    frame = frame.copy()
    frame["_yield_area"] = frame["rendimiento"] * frame["cosechada"]

    aggregated = (
        frame.groupby(group_keys, as_index=False)
        .agg(
            sembrada=("sembrada", "sum"),
            cosechada=("cosechada", "sum"),
            _yield_area=("_yield_area", "sum"),
            _harvested_area=("cosechada", "sum"),
            _mean_yield=("rendimiento", "mean"),
        )
    )
    aggregated["rendimiento"] = np.where(
        aggregated["_harvested_area"] > 0,
        aggregated["_yield_area"] / aggregated["_harvested_area"],
        aggregated["_mean_yield"],
    )
    return aggregated.drop(
        columns=["_yield_area", "_harvested_area", "_mean_yield"]
    )


def main() -> None:
    if not CULTIVOS_PATH.exists():
        raise SystemExit(f"Crop catalog not found: {CULTIVOS_PATH}")
    if not MUNICIPIOS_PATH.exists():
        raise SystemExit(f"Municipality catalog not found: {MUNICIPIOS_PATH}")

    candidates = [
        path
        for path in sorted(DATASETS_DIR.rglob("*.csv"))
        if path.name not in OUTPUT_FILENAMES
        and not any(part.startswith(".") for part in path.parts)
    ]
    if not candidates:
        raise SystemExit(f"No SIAP CSV files found under {DATASETS_DIR}")

    frames: list[pd.DataFrame] = []
    for path in candidates:
        frame = read_csv_with_fallback(path)
        if frame is None:
            print(f"Skipped unreadable file: {path}")
            continue
        if not has_required_schema(frame):
            print(f"Skipped file without SIAP schema: {path.relative_to(BASE_DIR)}")
            continue
        frames.append(frame)
        print(f"Read {path.relative_to(BASE_DIR)} ({len(frame)} rows)")

    if not frames:
        raise SystemExit("No readable SIAP files with the expected schema were found")

    raw = pd.concat(frames, ignore_index=True, sort=False)
    print(f"\nCombined raw rows: {len(raw)}")

    state_id = pd.to_numeric(series_or_empty(raw, "idestado"), errors="coerce")
    state_name = series_or_empty(raw, "nomestado").map(normalize_label)
    state_mask = (state_id == 10) | (state_name == "durango")

    cycle = series_or_empty(raw, "nomcicloproductivo").map(normalize_label)
    cycle_mask = cycle.isin(VALID_CYCLES)

    modality = series_or_empty(raw, "nommodalidad").map(normalize_label)
    modality_mask = modality.isin(VALID_MODALITIES)

    filtered = raw[state_mask & cycle_mask & modality_mask].copy()
    print(
        "Rows after Durango / temporal-riego / Primavera-Verano-Perennes "
        f"filter: {len(filtered)}"
    )
    if filtered.empty:
        raise SystemExit("No rows remain after geographic and cycle filtering")

    crop_map = load_crop_catalog()
    crop_labels = series_or_empty(filtered, "nomcultivo").map(normalize_label)
    filtered["cultivo_id"] = crop_labels.map(crop_map)
    unmatched_crops = int(filtered["cultivo_id"].isna().sum())
    if unmatched_crops:
        examples = sorted(crop_labels[filtered["cultivo_id"].isna()].unique())
        print(
            f"Dropped {unmatched_crops} rows without an INIFAP crop match "
            f"(e.g. {', '.join(examples[:5])})"
        )
    filtered = filtered[filtered["cultivo_id"].notna()].copy()
    filtered["cultivo_id"] = filtered["cultivo_id"].astype(str)
    print(
        f"Matched {len(filtered)} rows to {filtered['cultivo_id'].nunique()} "
        "catalog crops"
    )
    if filtered.empty:
        raise SystemExit("No rows matched the INIFAP crop catalog")

    municipalities_by_id, municipalities_by_name = load_municipalities()
    municipality_name = series_or_empty(filtered, "nommunicipio").map(normalize_label)
    raw_municipality_id = pd.to_numeric(
        series_or_empty(filtered, "idmunicipio"), errors="coerce"
    )
    mapped_municipality_id = municipality_name.map(municipalities_by_name)

    filtered["cve_mun"] = raw_municipality_id.where(
        raw_municipality_id.between(1, 39)
    ).fillna(mapped_municipality_id)
    invalid_municipalities = int(filtered["cve_mun"].isna().sum())
    if invalid_municipalities:
        print(f"Dropped {invalid_municipalities} rows without a valid municipality")
    filtered = filtered[filtered["cve_mun"].notna()].copy()
    filtered["cve_mun"] = filtered["cve_mun"].astype(int)

    mismatched_ids = int(
        (
            raw_municipality_id.notna()
            & mapped_municipality_id.notna()
            & (raw_municipality_id != mapped_municipality_id)
        ).sum()
    )
    if mismatched_ids:
        print(
            f"  ! {mismatched_ids} rows have an idmunicipio that disagrees with "
            "the municipality name; the numeric code was kept"
        )

    filtered["nommunicipio"] = (
        filtered["cve_mun"].map(municipalities_by_id).fillna(
            series_or_empty(filtered, "nommunicipio")
        )
    )

    filtered["anio"] = pd.to_numeric(
        series_or_empty(filtered, "anio"), errors="coerce"
    )
    valid_years = filtered["anio"].between(1900, 2100)
    if int((~valid_years).sum()):
        print(f"Dropped {int((~valid_years).sum())} rows without a valid year")
    filtered = filtered[valid_years].copy()
    filtered["anio"] = filtered["anio"].astype(int)

    filtered["modalidad"] = modality[filtered.index].map(
        {"temporal": "temporal", "riego": "riego"}
    )

    for column in ("sembrada", "cosechada", "rendimiento"):
        filtered[column] = pd.to_numeric(filtered[column], errors="coerce")

    valid_numbers = (
        filtered["sembrada"].gt(0)
        & filtered["cosechada"].notna()
        & filtered["rendimiento"].notna()
    )
    dropped_numbers = int((~valid_numbers).sum())
    if dropped_numbers:
        print(
            f"Dropped {dropped_numbers} rows with sembrada <= 0 or missing "
            "cosechada/rendimiento"
        )
    filtered = filtered[valid_numbers].copy()
    if filtered.empty:
        raise SystemExit("No rows remain after numeric validation")

    aggregated = aggregate_to_municipality_level(filtered)
    print(
        f"Aggregated {len(filtered)} sub-region rows into {len(aggregated)} "
        "municipality-level records"
    )

    aggregated["tasa_cosecha"] = (
        aggregated["cosechada"] / aggregated["sembrada"]
    )
    historical_median = aggregated.groupby(
        ["cve_mun", "cultivo_id", "modalidad"]
    )["rendimiento"].transform("median")
    aggregated["exito_cosecha"] = (
        (aggregated["tasa_cosecha"] >= 0.80)
        & (aggregated["rendimiento"] >= 0.75 * historical_median)
    ).astype(int)

    output_columns = [
        "anio",
        "cve_mun",
        "nommunicipio",
        "cultivo_id",
        "modalidad",
        "sembrada",
        "cosechada",
        "rendimiento",
        "tasa_cosecha",
        "exito_cosecha",
    ]
    result = (
        aggregated[output_columns]
        .sort_values(["anio", "cve_mun", "cultivo_id", "modalidad"])
        .reset_index(drop=True)
    )
    result.to_csv(OUTPUT_PATH, index=False, encoding="utf-8")

    class_counts = result["exito_cosecha"].value_counts().sort_index()
    print(f"\nSaved {len(result)} rows to {OUTPUT_PATH.relative_to(BASE_DIR)}")
    print(f"Years: {result['anio'].min()}-{result['anio'].max()}")
    print(f"Municipalities: {result['cve_mun'].nunique()}")
    print(f"Crops: {result['cultivo_id'].nunique()}")
    print(
        "Target distribution: "
        + ", ".join(
            f"exito_cosecha={label}: {count}"
            for label, count in class_counts.items()
        )
    )


if __name__ == "__main__":
    main()
