"""
Génère funds.json : le détail par fonds individuel (OPCVM) sur la dernière
date de publication disponible.

build_history.py agrège tout au niveau société de gestion ; ce script
dénormalise au niveau fonds pour des usages que l'agrégat ne permet pas :
classements par fonds, comparateur multi-fonds, filtres par indice de
référence ou par réseau bancaire (toutes ces colonnes existent déjà dans
la source ASFIM, elles n'étaient simplement pas exposées côté frontend).
"""
import json
from datetime import datetime, timezone

import pandas as pd

SOURCE_CSV = "dashboard_data.csv"
OUTPUT_JSON = "funds.json"

# Colonnes source -> clés du JSON exposé au frontend
FIELD_MAP = {
    "CODE ISIN": "isin",
    "OPCVM": "name",
    "Société de Gestion": "societe",
    "Classification": "classification",
    "Indice Bentchmark": "indiceBenchmark",
    "VL": "vl",
    "AN": "an",
    "1 jour": "perf1j",
    "1 semaine": "perf1s",
    "1 mois": "perf1m",
    "3 mois": "perf3m",
    "6 mois": "perf6m",
    "1 an": "perf1an",
    "2 ans": "perf2ans",
    "3 ans": "perf3ans",
    "5 ans": "perf5ans",
}


def clean(value):
    """Convertit les types numpy/pandas en types JSON natifs, NaN -> None."""
    if pd.isna(value):
        return None
    if hasattr(value, "item"):  # numpy.float64 / numpy.int64 -> float/int Python
        value = value.item()
    if isinstance(value, float):
        return round(value, 6)
    return value


def parse_reseau(value):
    """'WAFA GESTION; ATTIJARIWAFA BANK' -> ['WAFA GESTION', 'ATTIJARIWAFA BANK']"""
    if pd.isna(value):
        return []
    return [v.strip() for v in str(value).split(";") if v.strip()]


def main():
    df = pd.read_csv(SOURCE_CSV, encoding="utf-8-sig")
    df.columns = [str(c).strip() for c in df.columns]

    if df.empty or "DatePublication" not in df.columns:
        print(f"Aucune donnée exploitable dans {SOURCE_CSV}.")
        return

    df["DatePublication"] = pd.to_datetime(df["DatePublication"], errors="coerce").dt.strftime("%Y-%m-%d")

    latest_date = df["DatePublication"].max()
    latest = df[df["DatePublication"] == latest_date].copy()

    funds = []
    for _, row in latest.iterrows():
        fund = {
            new_key: clean(row[old_key])
            for old_key, new_key in FIELD_MAP.items()
            if old_key in latest.columns
        }
        fund["reseau"] = parse_reseau(row.get("Réseau placeur"))
        funds.append(fund)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date": str(latest_date),
        "count": len(funds),
        "funds": funds,
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"{OUTPUT_JSON} généré : {len(funds)} fonds pour la date {latest_date}.")


if __name__ == "__main__":
    main()
