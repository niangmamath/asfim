import streamlit as st
from pathlib import Path

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters
from components.metrics import render_kpi_cards

st.set_page_config(page_title="ASFIM Executive Dashboard", page_icon="📈", layout="wide")

with open(Path(__file__).resolve().parent / "styles" / "custom.css", "r", encoding="utf-8") as f:
    st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)

st.title("ASFIM Executive Dashboard")
st.caption("Plateforme professionnelle de Business Intelligence pour les OPCVM marocains")

df = load_dashboard_data()
df = render_global_filters(df)

render_kpi_cards(df)

st.divider()

col1, col2 = st.columns(2)
with col1:
    st.subheader("Évolution de l'actif net")
    if "DatePublication" in df.columns and "AN" in df.columns:
        trend = df.groupby("DatePublication")["AN"].sum().reset_index()
        st.line_chart(trend.set_index("DatePublication"), use_container_width=True)

with col2:
    st.subheader("Évolution des performances")
    if "DatePublication" in df.columns and "YTD" in df.columns:
        perf = df.groupby("DatePublication")["YTD"].mean().reset_index()
        st.line_chart(perf.set_index("DatePublication"), use_container_width=True)

st.divider()

col3, col4 = st.columns(2)
with col3:
    st.subheader("Top 10 OPCVM")
    if "YTD" in df.columns and "OPCVM" in df.columns:
        top = df.dropna(subset=["YTD"]).nlargest(10, "YTD")[["OPCVM", "YTD", "AN", "VL"]]
        st.dataframe(top, use_container_width=True, hide_index=True)

with col4:
    st.subheader("Top 10 sociétés")
    if "Société de Gestion" in df.columns and "AN" in df.columns:
        top_soc = df.groupby("Société de Gestion")["AN"].sum().reset_index().sort_values("AN", ascending=False).head(10)
        st.bar_chart(top_soc.set_index("Société de Gestion"), use_container_width=True)
