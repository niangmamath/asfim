"""
Reconstruction manuelle/locale de history.json à partir d'un dashboard_data.csv
complet (toutes dates). N'est PLUS appelé par le workflow CI : sync.py maintient
désormais history.json de façon incrémentale, directement sur Vercel Blob, pour
éviter de committer un historique CSV complet dans git (voir sync.py).

Reste utile pour reconstruire l'historique en repartant de zéro si besoin.
"""
import json
from datetime import datetime, timezone

import pandas as pd

from aggregate import clean_numeric_columns, detect_columns as _detect_agg_columns, build_companies, build_hierarchy

SOURCE_CSV = "dashboard_data.csv"
OUTPUT_JSON = "history.json"


def detect_columns(df):
    col_societe, col_classif = _detect_agg_columns(df)
    col_date = next((c for c in df.columns if "date" in c.lower()), "DatePublication")
    col_type = next((c for c in df.columns if "type" in c.lower()), "TypePublication")
    return col_societe, col_classif, col_date, col_type


def main():
    df = pd.read_csv(SOURCE_CSV, encoding="utf-8-sig")
    df.columns = [str(c).strip() for c in df.columns]

    col_societe, col_classif, col_date, col_type = detect_columns(df)
    df = clean_numeric_columns(df)

    if col_date in df.columns:
        df[col_date] = pd.to_datetime(df[col_date], errors="coerce").dt.strftime("%Y-%m-%d")

    classif_dispo = (
        sorted(df[col_classif].astype(str).dropna().unique().tolist())
        if col_classif in df.columns else []
    )

    dates_dispo = []
    if col_date in df.columns and col_type in df.columns:
        df_dates = df[[col_date, col_type]].dropna().drop_duplicates().sort_values(col_date, ascending=False)
        for _, row in df_dates.iterrows():
            dates_dispo.append({"date": str(row[col_date]), "type": str(row[col_type])})

    history = {}
    for date_entry in dates_dispo:
        date = date_entry["date"]
        df_date = df[df[col_date] == date]
        history[date] = {
            "type": date_entry["type"],
            "companies": build_companies(df_date, col_societe, col_classif),
            "hierarchy": build_hierarchy(df_date, col_classif, col_societe)
        }

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "classifications": classif_dispo,
        "dates": dates_dispo,
        "history": history
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"{OUTPUT_JSON} généré : {len(history)} date(s), {len(classif_dispo)} classification(s).")


if __name__ == "__main__":
    main()
