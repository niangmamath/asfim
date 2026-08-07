import pandas as pd
import streamlit as st


def render_kpi_cards(df):
    metrics = []
    if "AN" in df.columns:
        metrics.append(("Actif Net Total", f"{df['AN'].sum():,.0f} MAD", ""))
    else:
        metrics.append(("Actif Net Total", "N/A", ""))

    if "VL" in df.columns:
        metrics.append(("Valeur Liquidative Totale", f"{df['VL'].sum():,.0f} MAD", ""))
    else:
        metrics.append(("Valeur Liquidative Totale", "N/A", ""))

    metrics.append(("Nombre OPCVM", f"{df['OPCVM'].nunique() if 'OPCVM' in df.columns else 0}", ""))
    metrics.append(("Nombre sociétés", f"{df['Société de Gestion'].nunique() if 'Société de Gestion' in df.columns else 0}", ""))

    if "YTD" in df.columns:
        metrics.append(("Performance moyenne YTD", f"{df['YTD'].mean():.2f}%", ""))
    else:
        metrics.append(("Performance moyenne YTD", "N/A", ""))

    if "1 an" in df.columns:
        metrics.append(("Performance moyenne 1 an", f"{df['1 an'].mean():.2f}%", ""))
    else:
        metrics.append(("Performance moyenne 1 an", "N/A", ""))

    if "PerformancePositive" in df.columns:
        metrics.append(("% fonds positifs", f"{(df['PerformancePositive'].mean() * 100):.1f}%", ""))
    else:
        metrics.append(("% fonds positifs", "N/A", ""))

    if "DatePublication" in df.columns:
        last_date = df["DatePublication"].dropna().max()
        metrics.append(("Date dernière publication", last_date.strftime("%d/%m/%Y") if pd.notna(last_date) else "N/A", ""))
    else:
        metrics.append(("Date dernière publication", "N/A", ""))

    cols = st.columns(4)
    for idx, (label, value, delta) in enumerate(metrics):
        with cols[idx % 4]:
            st.metric(label, value, delta)
