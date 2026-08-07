from pathlib import Path

import pandas as pd
import streamlit as st


BASE_DIR = Path(__file__).resolve().parent.parent
CSV_PATH = BASE_DIR / "dashboard_data.csv"
PARQUET_PATH = BASE_DIR / "dashboard_data.parquet"


def _normalize_col_name(name: str) -> str:
    return str(name).strip().lower().replace(" ", "").replace("-", "")


def find_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    normalized = { _normalize_col_name(col): col for col in df.columns }
    for candidate in candidates:
        match = normalized.get(_normalize_col_name(candidate))
        if match:
            return match
    return None


@st.cache_data(show_spinner="Chargement du dataset...")
def load_dashboard_data() -> pd.DataFrame:
    if CSV_PATH.exists():
        df = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
    elif PARQUET_PATH.exists():
        df = pd.read_parquet(PARQUET_PATH)
    else:
        st.error("Aucun dataset trouvé. Exécutez d'abord prepare_dashboard.py pour générer dashboard_data.csv ou dashboard_data.parquet.")
        st.stop()

    df = df.copy()
    df.columns = [str(col).strip() for col in df.columns]

    date_col = find_column(df, ["DatePublication", "Date publication", "datepublication"])
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        if "DatePublication" not in df.columns:
            df.rename(columns={date_col: "DatePublication"}, inplace=True)

    numeric_cols = [
        "Commission de souscription",
        "Commission de rachat",
        "Frais de gestion",
        "AN",
        "VL",
        "YTD",
        "1 jour",
        "1 semaine",
        "1 mois",
        "3 mois",
        "6 mois",
        "1 an",
        "2 ans",
        "3 ans",
        "5 ans",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace("%", "", regex=False)
                .str.replace(",", ".", regex=False)
                .str.replace(" ", "", regex=False)
                .replace(["-", "", "nan", "None"], pd.NA)
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")

    if "YTD" in df.columns and "PerformancePositive" not in df.columns:
        df["PerformancePositive"] = df["YTD"] > 0
    if "VL" in df.columns and "VL_Million" not in df.columns:
        df["VL_Million"] = df["VL"] / 1_000_000
    if "AN" in df.columns and "AN_Million" not in df.columns:
        df["AN_Million"] = df["AN"] / 1_000_000

    return df
