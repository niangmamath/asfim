import os
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

st.set_page_config(page_title="ASFIM Dashboard", page_icon="📈", layout="wide")

BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "dashboard_data.csv"
PARQUET_PATH = BASE_DIR / "dashboard_data.parquet"


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

    date_col = "DatePublication" if "DatePublication" in df.columns else None
    if date_col is None:
        for col in df.columns:
            if "date" in col.lower():
                date_col = col
                break

    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        df = df.rename(columns={date_col: "DatePublication"})

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

    if "VL" in df.columns and "VL_Million" not in df.columns:
        df["VL_Million"] = df["VL"] / 1_000_000

    if "AN" in df.columns and "AN_Million" not in df.columns:
        df["AN_Million"] = df["AN"] / 1_000_000

    if "YTD" in df.columns and "PerformancePositive" not in df.columns:
        df["PerformancePositive"] = df["YTD"] > 0

    return df


df = load_dashboard_data()

st.title("📊 Dashboard interactif ASFIM")
st.caption("Analyse des OPCVM à partir des fichiers générés par prepare_dashboard.py")

st.sidebar.header("Filtres")

if "DatePublication" in df.columns:
    min_date = df["DatePublication"].min().date()
    max_date = df["DatePublication"].max().date()
    start_date, end_date = st.sidebar.date_input(
        "Période",
        value=(min_date, max_date),
        min_value=min_date,
        max_value=max_date,
    )
    if isinstance(start_date, tuple):
        start_date, end_date = start_date
    df = df[(df["DatePublication"].dt.date >= start_date) & (df["DatePublication"].dt.date <= end_date)]

for col in ["Société de Gestion", "Classification", "TypePublication"]:
    if col in df.columns:
        options = sorted(df[col].dropna().astype(str).unique())
        selected = st.sidebar.multiselect(col, options, default=options)
        if selected:
            df = df[df[col].astype(str).isin(selected)]

st.sidebar.divider()
st.sidebar.caption("Le dashboard se met à jour automatiquement selon les filtres.")

kpi1, kpi2, kpi3, kpi4 = st.columns(4)
kpi1.metric("Fonds observés", f"{len(df):,}")

if "AN" in df.columns:
    kpi2.metric("Actif net total", f"{df['AN'].sum():,.0f} MAD")
else:
    kpi2.metric("Actif net total", "N/A")

if "YTD" in df.columns:
    kpi3.metric("Performance YTD moyenne", f"{df['YTD'].mean():.2f} %")
else:
    kpi3.metric("Performance YTD moyenne", "N/A")

if "PerformancePositive" in df.columns:
    kpi4.metric("Fonds positifs", f"{int(df['PerformancePositive'].sum())}")
else:
    kpi4.metric("Fonds positifs", "N/A")

st.divider()

col_left, col_right = st.columns(2)

with col_left:
    st.subheader("🏆 Top 10 des performances")
    if "YTD" in df.columns and "OPCVM" in df.columns:
        top_perf = df.dropna(subset=["YTD"]).nlargest(10, "YTD")
        fig_bar = px.bar(
            top_perf,
            x="YTD",
            y="OPCVM",
            orientation="h",
            color="YTD",
            color_continuous_scale="Viridis",
            text="YTD",
        )
        fig_bar.update_traces(texttemplate="%{text:.2f}%", textposition="outside")
        fig_bar.update_layout(xaxis_title="Performance YTD (%)", yaxis_title=None, showlegend=False)
        st.plotly_chart(fig_bar, use_container_width=True)
    else:
        st.info("Colonnes YTD/OPCVM introuvables dans le dataset.")

with col_right:
    st.subheader("🍩 Répartition par classification")
    if "Classification" in df.columns:
        dist = (
            df["Classification"]
            .dropna()
            .astype(str)
            .value_counts()
            .reset_index()
        )
        dist.columns = ["Classification", "Nombre"]
        fig_pie = px.pie(dist, values="Nombre", names="Classification", hole=0.5)
        fig_pie.update_traces(textposition="inside", textinfo="percent+label")
        st.plotly_chart(fig_pie, use_container_width=True)
    else:
        st.info("Colonne Classification introuvable dans le dataset.")

st.divider()
st.subheader("📋 Données détaillées")
st.dataframe(df, use_container_width=True)