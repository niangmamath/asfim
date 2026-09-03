"""
Génère un unique fichier history.json contenant, pour CHAQUE date de publication,
les agrégats par société de gestion (même logique que /api/dashboard côté api_server.py).

Ce fichier est ensuite uploadé sur Vercel Blob et consommé statiquement par le frontend
(plus besoin d'un backend live comme Render : le filtrage par date se fait côté client).
"""
import json
from datetime import datetime, timezone

import pandas as pd

SOURCE_CSV = "dashboard_data.csv"
OUTPUT_JSON = "history.json"


def detect_columns(df):
    col_societe = next((c for c in df.columns if "soci" in c.lower() and "gestion" in c.lower()), "Société de gestion")
    col_classif = next((c for c in df.columns if "classif" in c.lower()), "Classification")
    col_date = next((c for c in df.columns if "date" in c.lower()), "DatePublication")
    col_type = next((c for c in df.columns if "type" in c.lower()), "TypePublication")
    return col_societe, col_classif, col_date, col_type


def build_companies(df, col_societe, col_classif):
    companies = []
    if df.empty or col_societe not in df.columns:
        return companies

    for name, group in df.groupby(col_societe):
        assets = float(group["AN"].sum()) if "AN" in group.columns else 0.0
        vl_total = float(group["VL"].sum()) if "VL" in group.columns else 0.0
        funds_count = int(group["OPCVM"].nunique()) if "OPCVM" in group.columns else len(group)

        positives = 0
        perf_ytd = 0.0
        if "YTD" in group.columns:
            ytd_group = group["YTD"].dropna()
            positives = int((ytd_group > 0).sum())
            if not ytd_group.empty:
                perf_ytd = float(ytd_group.mean())

        classifications = group[col_classif].dropna().unique().tolist() if col_classif in group.columns else []

        companies.append({
            "id": str(name),
            "name": str(name),
            "assets": assets,
            "vlTotal": vl_total,
            "fundsCount": funds_count,
            "positiveFundsCount": positives,
            "classifications": classifications,
            "perf1Y": perf_ytd
        })

    companies.sort(key=lambda c: c["assets"], reverse=True)
    for i, c in enumerate(companies):
        c["rank"] = i + 1

    return companies


def build_hierarchy(df, col_classif, col_societe):
    hierarchy = []
    if df.empty or col_classif not in df.columns or col_societe not in df.columns:
        return hierarchy

    for classif, classif_group in df.groupby(col_classif):
        children = []
        for soc, soc_group in classif_group.groupby(col_societe):
            children.append({"name": str(soc), "size": float(soc_group["AN"].sum())})
        hierarchy.append({"name": str(classif), "children": children})

    return hierarchy


def main():
    df = pd.read_csv(SOURCE_CSV, encoding="utf-8-sig")
    df.columns = [str(c).strip() for c in df.columns]

    col_societe, col_classif, col_date, col_type = detect_columns(df)

    numeric_cols = ["AN", "VL", "YTD"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = (
                df[col].astype(str)
                .str.replace("%", "", regex=False)
                .str.replace(",", ".", regex=False)
                .str.replace(" ", "", regex=False)
                .replace(["-", "", "nan", "None"], pd.NA)
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")

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
