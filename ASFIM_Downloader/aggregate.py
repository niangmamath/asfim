"""
Logique d'agrégation partagée.

Utilisée par sync.py (qui traite une date à la fois, en incrémental) et par
build_history.py / build_funds.py (qui repartent d'un CSV complet, pour une
reconstruction manuelle/locale) — pour ne pas maintenir deux copies qui
finissent par diverger.
"""
import pandas as pd

NUMERIC_COLS = [
    "AN", "VL", "YTD",
    "1 jour", "1 semaine", "1 mois", "3 mois", "6 mois",
    "1 an", "2 ans", "3 ans", "5 ans",
]


def clean_numeric_columns(df, columns=None):
    """Nettoie les colonnes numériques au format ASFIM (virgules décimales, %, espaces)."""
    df = df.copy()
    for col in (columns or NUMERIC_COLS):
        if col in df.columns:
            df[col] = (
                df[col].astype(str)
                .str.replace("%", "", regex=False)
                .str.replace(",", ".", regex=False)
                .str.replace(" ", "", regex=False)
                .replace(["-", "", "nan", "None"], pd.NA)
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def detect_columns(df):
    col_societe = next((c for c in df.columns if "soci" in c.lower() and "gestion" in c.lower()), "Société de gestion")
    col_classif = next((c for c in df.columns if "classif" in c.lower()), "Classification")
    return col_societe, col_classif


def build_companies(df, col_societe, col_classif):
    """Agrège un DataFrame (une seule date) par société de gestion."""
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
    """Hiérarchie classification -> sociétés (une seule date), pour le treemap."""
    hierarchy = []
    if df.empty or col_classif not in df.columns or col_societe not in df.columns:
        return hierarchy

    for classif, classif_group in df.groupby(col_classif):
        children = []
        for soc, soc_group in classif_group.groupby(col_societe):
            children.append({"name": str(soc), "size": float(soc_group["AN"].sum())})
        hierarchy.append({"name": str(classif), "children": children})

    return hierarchy
