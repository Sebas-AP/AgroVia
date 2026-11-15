#!/usr/bin/env python3
"""Fetch NASA POWER climate data and build the Durango modeling dataset.

For every municipality/year present in the cleaned SIAP data, this script
downloads daily NASA POWER values, aggregates June-October (the main
agricultural cycle), caches the result, and inner-joins it with SIAP.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

BASE_DIR = Path(__file__).resolve().parent
SIAP_PATH = BASE_DIR / "siap_durango_limpio.csv"
MUNICIPIOS_PATH = BASE_DIR / "datasets" / "municipios_durango.json"
CACHE_PATH = BASE_DIR / "clima_nasa_durango.csv"
MASTER_PATH = BASE_DIR / "dataset_durango_final.csv"

NASA_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = [
    "PRECTOTCORR",
    "T2M",
    "T2M_MIN",
    "T2M_MAX",
    "ALLSKY_SFC_SW_DWN",
]
CYCLE_MONTHS = (6, 7, 8, 9, 10)
CACHE_COLUMNS = [
    "cve_mun",
    "anio",
    "lluvia_ciclo_mm",
    "temp_media_c",
    "temp_max_c",
    "temp_min_extrema_c",
    "radiacion_mj_m2",
]
REQUEST_DELAY_SECONDS = 0.5
REQUEST_TIMEOUT_SECONDS = 90
MAX_ATTEMPTS = 3


def load_municipalities() -> dict[int, dict]:
    with MUNICIPIOS_PATH.open(encoding="utf-8") as handle:
        municipalities = json.load(handle)
    return {int(item["cve_mun"]): item for item in municipalities}


def load_cache() -> pd.DataFrame:
    if not CACHE_PATH.exists():
        return pd.DataFrame(columns=CACHE_COLUMNS)
    cache = pd.read_csv(CACHE_PATH, encoding="utf-8-sig")
    for column in ("cve_mun", "anio"):
        if column in cache.columns:
            cache[column] = pd.to_numeric(cache[column], errors="coerce")
    cache = cache.dropna(subset=["cve_mun", "anio"])
    cache["cve_mun"] = cache["cve_mun"].astype(int)
    cache["anio"] = cache["anio"].astype(int)
    return cache


def aggregate_daily_parameters(
    cve_mun: int, parameter_data: dict[str, dict[str, float]]
) -> pd.DataFrame:
    dates = sorted(
        {
            date
            for parameter in PARAMETERS
            for date in parameter_data.get(parameter, {})
        }
    )
    records: list[dict[str, object]] = []
    for date in dates:
        month = int(date[4:6])
        if month not in CYCLE_MONTHS:
            continue
        record: dict[str, object] = {"anio": int(date[:4])}
        for parameter in PARAMETERS:
            record[parameter] = parameter_data.get(parameter, {}).get(date)
        records.append(record)

    if not records:
        return pd.DataFrame(columns=CACHE_COLUMNS)

    daily = pd.DataFrame(records)
    for parameter in PARAMETERS:
        daily[parameter] = pd.to_numeric(daily[parameter], errors="coerce")
    daily = daily.replace(-999.0, np.nan).replace(-999, np.nan)

    aggregated = daily.groupby("anio", as_index=False).agg(
        lluvia_ciclo_mm=("PRECTOTCORR", lambda values: values.sum(min_count=1)),
        temp_media_c=("T2M", "mean"),
        temp_max_c=("T2M_MAX", "mean"),
        temp_min_extrema_c=("T2M_MIN", "min"),
        radiacion_mj_m2=("ALLSKY_SFC_SW_DWN", "mean"),
    )
    aggregated.insert(0, "cve_mun", cve_mun)
    return aggregated[CACHE_COLUMNS]


def fetch_municipality(
    session: requests.Session,
    cve_mun: int,
    latitude: float,
    longitude: float,
    start_year: int,
    end_year: int,
) -> pd.DataFrame | None:
    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "AG",
        "latitude": latitude,
        "longitude": longitude,
        "start": f"{start_year}0101",
        "end": f"{end_year}1231",
        "format": "JSON",
    }

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = session.get(
                NASA_URL,
                params=params,
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            payload = response.json()
            parameter_data = payload["properties"]["parameter"]
            aggregated = aggregate_daily_parameters(cve_mun, parameter_data)
            if aggregated.empty:
                print("  ! NASA POWER returned no June-October records")
                return None
            return aggregated
        except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
            if attempt == MAX_ATTEMPTS:
                print(f"  ! NASA POWER request failed after {attempt} attempts: {exc}")
                return None
            wait_seconds = 2 * attempt
            print(f"  ! Request error ({exc}); retrying in {wait_seconds}s")
            time.sleep(wait_seconds)
    return None


def save_cache(cache: pd.DataFrame) -> None:
    ordered = cache[CACHE_COLUMNS].sort_values(["cve_mun", "anio"])
    ordered.to_csv(CACHE_PATH, index=False, encoding="utf-8")


def main() -> None:
    if not SIAP_PATH.exists():
        raise SystemExit(
            f"Cleaned SIAP file not found: {SIAP_PATH}. Run clean_siap.py first."
        )
    if not MUNICIPIOS_PATH.exists():
        raise SystemExit(f"Municipality catalog not found: {MUNICIPIOS_PATH}")

    siap = pd.read_csv(SIAP_PATH, encoding="utf-8-sig")
    missing_columns = {"cve_mun", "anio"} - set(siap.columns)
    if missing_columns:
        raise SystemExit(
            "SIAP file is missing required columns: "
            + ", ".join(sorted(missing_columns))
        )

    for column in ("cve_mun", "anio"):
        siap[column] = pd.to_numeric(siap[column], errors="coerce")
    siap = siap.dropna(subset=["cve_mun", "anio"]).copy()
    siap["cve_mun"] = siap["cve_mun"].astype(int)
    siap["anio"] = siap["anio"].astype(int)

    needed = (
        siap[["cve_mun", "anio"]]
        .drop_duplicates()
        .sort_values(["cve_mun", "anio"])
        .reset_index(drop=True)
    )
    municipalities = load_municipalities()

    unknown_municipalities = sorted(
        set(needed["cve_mun"]) - set(municipalities)
    )
    if unknown_municipalities:
        print(
            "Warning: no coordinates for cve_mun "
            + ", ".join(str(code) for code in unknown_municipalities)
        )
        needed = needed[needed["cve_mun"].isin(municipalities)].copy()

    cache = load_cache()
    if cache.empty:
        missing_pairs = needed.copy()
    else:
        missing_pairs = needed.merge(
            cache[["cve_mun", "anio"]].drop_duplicates(),
            on=["cve_mun", "anio"],
            how="left",
            indicator=True,
        )
        missing_pairs = missing_pairs[
            missing_pairs["_merge"] == "left_only"
        ].drop(columns="_merge")

    print(
        f"Required municipality-year pairs: {len(needed)} "
        f"({needed['cve_mun'].nunique()} municipalities, "
        f"{needed['anio'].min()}-{needed['anio'].max()})"
    )
    print(f"Cached pairs: {len(cache)}")

    if missing_pairs.empty:
        print("Climate cache is complete; no NASA POWER requests needed.")
    else:
        print(f"Pairs missing from cache: {len(missing_pairs)}")
        new_frames: list[pd.DataFrame] = []
        with requests.Session() as session:
            session.headers.update({"User-Agent": "AgroVia/1.0 (Durango agriculture)"})
            for cve_mun, group in missing_pairs.groupby("cve_mun", sort=True):
                municipality = municipalities[int(cve_mun)]
                start_year = int(group["anio"].min())
                end_year = int(group["anio"].max())
                print(
                    f"Fetching {municipality['municipio']} "
                    f"(cve_mun={int(cve_mun)}, {start_year}-{end_year}) ..."
                )
                frame = fetch_municipality(
                    session=session,
                    cve_mun=int(cve_mun),
                    latitude=float(municipality["lat"]),
                    longitude=float(municipality["lon"]),
                    start_year=start_year,
                    end_year=end_year,
                )
                if frame is not None and not frame.empty:
                    new_frames.append(frame)
                    print(f"  Downloaded {len(frame)} year records")
                time.sleep(REQUEST_DELAY_SECONDS)

        if new_frames:
            cache = pd.concat([cache, *new_frames], ignore_index=True)
            cache = cache.drop_duplicates(
                subset=["cve_mun", "anio"], keep="last"
            )
            save_cache(cache)
            print(f"Saved climate cache to {CACHE_PATH.relative_to(BASE_DIR)}")
        else:
            print("No new climate records were downloaded")

    available_pairs = set(
        zip(cache["cve_mun"].astype(int), cache["anio"].astype(int))
    )
    missing_after_fetch = [
        (int(row.cve_mun), int(row.anio))
        for row in needed.itertuples(index=False)
        if (int(row.cve_mun), int(row.anio)) not in available_pairs
    ]
    if missing_after_fetch:
        preview = ", ".join(
            f"({cve_mun}, {anio})" for cve_mun, anio in missing_after_fetch[:10]
        )
        print(
            f"Warning: {len(missing_after_fetch)} municipality-year pairs could "
            f"not be retrieved: {preview}"
        )

    if cache.empty:
        raise SystemExit("No climate data available; cannot build master dataset")

    master = siap.merge(
        cache[CACHE_COLUMNS],
        on=["cve_mun", "anio"],
        how="inner",
        validate="many_to_one",
    )
    if master.empty:
        raise SystemExit(
            "Inner join produced zero rows; check municipality codes and years"
        )

    master.to_csv(MASTER_PATH, index=False, encoding="utf-8")
    print(f"\nSaved {len(master)} rows to {MASTER_PATH.relative_to(BASE_DIR)}")
    print(f"Municipalities in master dataset: {master['cve_mun'].nunique()}")
    print(f"Years in master dataset: {master['anio'].min()}-{master['anio'].max()}")
    print(f"Rows joined with climate: {len(master)}")


if __name__ == "__main__":
    main()
