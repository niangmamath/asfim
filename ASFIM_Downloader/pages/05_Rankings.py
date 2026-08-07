import plotly.express as px
import streamlit as st

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="Rankings", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("Rankings")
st.caption("Classements et meilleurs / pire fonds")

if "YTD" in df.columns and "OPCVM" in df.columns:
    top10 = df.dropna(subset=["YTD"]).nlargest(10, "YTD")[["OPCVM", "YTD", "Classification", "Société de Gestion"]]
    bottom10 = df.dropna(subset=["YTD"]).nsmallest(10, "YTD")[["OPCVM", "YTD", "Classification", "Société de Gestion"]]
    st.subheader("Top 10")
    st.dataframe(top10, use_container_width=True, hide_index=True)
    st.subheader("Bottom 10")
    st.dataframe(bottom10, use_container_width=True, hide_index=True)

if "Société de Gestion" in df.columns and "AN" in df.columns:
    managers = df.groupby("Société de Gestion").agg(AN=("AN", "sum"), OPCVM=("OPCVM", "nunique")).reset_index().sort_values("AN", ascending=False).head(10)
    st.subheader("Top Asset Managers")
    st.bar_chart(managers.set_index("Société de Gestion")["AN"], use_container_width=True)
