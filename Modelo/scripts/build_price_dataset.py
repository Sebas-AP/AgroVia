"""Build the compact SIAP price/yield dataset used by POST /api/v1/precios.

Source: ``Modelo/datasets/datasets_cierre_agricola_raw_data/Cierre_agricola_mun_YYYY.csv``
(SIAP / Servicio de Información Agroalimentaria y Pesquera, cierre agrícola municipal).

Transformations, all explicit and reproducible:

1. Only rows for Durango are kept (the API's catalogue is Durango-only).
2. Only the four crops the Backend's catalog scores are kept:
   ``Maíz grano`` -> ``maiz_grano``, ``Frijol`` -> ``frijol_pinto``,
   ``Avena forrajera en verde`` -> ``avena_forrajera``,
   ``Sorgo forrajero en verde`` -> ``sorgo_forrajero``.
   SIAP does not separate bean varieties, so ``Frijol`` is mapped to the Modelo catalogue's
   ``frijol_pinto`` entry; that mapping is reported in the dataset metadata.
   The raw files change column names across years (``Nomcultivo`` -> ``Nomcultivo Sin Um`` and
   ``Preciomediorural`` -> ``Precio``); both spellings are read, with no value transformation.
3. Only rows whose ``Nomunidad`` is ``Tonelada`` are kept. No unit conversion is applied: a
   differently-unit row is discarded and counted, never converted by guesswork.
4. Empty source fields become JSON ``null``. Zero is kept as zero; it is never treated as
   missing, and a missing value is never backfilled.
5. ``Preciomediorural`` is kept exactly as received (MXN per tonne). The Backend converts it to
   MXN/kg; this script does not correct, smooth, or impute it.

Run from the repository root:

    python Modelo/scripts/build_price_dataset.py

The output is committed so the deployed Modelo service does not need the 55 MB of raw CSVs.
"""

from __future__ import annotations

import argparse
import csv
import json
import unicodedata
from collections import Counter
from pathlib import Path

MODELO_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = MODELO_DIR / "datasets" / "datasets_cierre_agricola_raw_data"
DEFAULT_OUTPUT = MODELO_DIR / "datasets" / "precios_siap_durango.json"

STATE = "durango"
UNIT = "tonelada"
CROP_MAP = {
    "maiz grano": "maiz_grano",
    "frijol": "frijol_pinto",
    "avena forrajera en verde": "avena_forrajera",
    "sorgo forrajero en verde": "sorgo_forrajero",
}
SOURCE_CROP_NAMES = {
    "maiz_grano": "Maíz grano",
    "frijol_pinto": "Frijol",
    "avena_forrajera": "Avena forrajera en verde",
    "sorgo_forrajero": "Sorgo forrajero en verde",
}


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(without_accents.lower().strip().split())


def number(raw: str | None) -> float | None:
    """Parse a SIAP numeric field, preserving null for genuinely absent values."""
    if raw is None:
        return None
    text = raw.strip().replace(",", "")
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def build_dataset(raw_dir: Path) -> dict:
    files = sorted(raw_dir.glob("Cierre_agricola_mun_*.csv"))
    if not files:
        raise FileNotFoundError(f"No SIAP CSVs found in {raw_dir}")

    records: list[dict] = []
    discarded = Counter()
    kept_by_year = Counter()

    for path in files:
        with path.open(encoding="latin-1") as handle:
            for row in csv.DictReader(handle):
                if normalize(row.get("Nomestado", "")) != STATE:
                    continue
                crop_name = row.get("Nomcultivo") or row.get("Nomcultivo Sin Um") or ""
                crop_id = CROP_MAP.get(normalize(crop_name))
                if crop_id is None:
                    continue
                if normalize(row.get("Nomunidad", "")) != UNIT:
                    discarded[f"unit:{row.get('Nomunidad', '')}"] += 1
                    continue

                try:
                    year = int(row["Anio"])
                except (KeyError, TypeError, ValueError):
                    discarded["year"] += 1
                    continue

                price_raw = row.get("Preciomediorural")
                if price_raw is None:
                    price_raw = row.get("Precio")

                record = {
                    "anio": year,
                    "municipio": row["Nommunicipio"],
                    "cultivo_id": crop_id,
                    "ciclo": row.get("Nomcicloproductivo") or None,
                    "modalidad": row.get("Nommodalidad") or None,
                    "precio_mxn_t": number(price_raw),
                    "rendimiento_t_ha": number(row.get("Rendimiento")),
                    "volumen_t": number(row.get("Volumenproduccion")),
                    "superficie_sembrada_ha": number(row.get("Sembrada")),
                    "superficie_cosechada_ha": number(row.get("Cosechada")),
                    "unidad_fuente": row.get("Nomunidad"),
                }
                if record["precio_mxn_t"] is None and record["rendimiento_t_ha"] is None:
                    discarded["price_and_yield_missing"] += 1
                    continue
                records.append(record)
                kept_by_year[year] += 1

    records.sort(key=lambda r: (r["municipio"], r["cultivo_id"], r["anio"], r["ciclo"] or "", r["modalidad"] or ""))

    warnings = [
        "Rows are kept exactly as SIAP reports them; prices are not corrected, smoothed or imputed.",
        "SIAP does not separate bean varieties: 'Frijol' is mapped to Modelo's 'frijol_pinto'.",
        "Only rows in 'Tonelada' are included; no unit conversion was applied.",
        (
            "Older raw files name the price column 'Precio' and the crop column 'Nomcultivo Sin Um'; "
            "those aliases are read as-is."
        ),
    ]
    for key, count in sorted(discarded.items()):
        warnings.append(f"Discarded {count} row(s) for {key}.")

    return {
        "fuente": "SIAP Cierre agrícola municipal (Durango)",
        "version": f"siap-{max(kept_by_year) if kept_by_year else 'unknown'}-1",
        "unidad_precio": "MXN/t",
        "unidad_rendimiento": "t/ha",
        "generado_por": "Modelo/scripts/build_price_dataset.py",
        "anios": sorted(kept_by_year),
        "cultivos": SOURCE_CROP_NAMES,
        "advertencias": warnings,
        "registros": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    dataset = build_dataset(args.raw_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(dataset, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(dataset['registros'])} records for {len(dataset['anios'])} years "
        f"to {args.output} ({args.output.stat().st_size} bytes)"
    )


if __name__ == "__main__":
    main()
