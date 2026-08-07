import pandas as pd
import plotly.express as px
import streamlit as st

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="Market Overview", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("Market Overview")
st.caption("Vue consolidée du marché des OPCVM")

if "Classification" in df.columns:
    fig = px.treemap(df.dropna(subset=["Classification"]), path=["Classification", "OPCVM"], values="AN", color="YTD")
    st.plotly_chart(fig, use_container_width=True)

if "Classification" in df.columns and "AN" in df.columns:
    sankey = df.groupby(["Classification", "Société de Gestion"])["AN"].sum().reset_index()
    fig2 = px.sunburst(sankey, path=["Classification", "Société de Gestion"], values="AN", color="AN")
    st.plotly_chart(fig2, use_container_width=True)

col1, col2 = st.columns(2)
with col1:
    if "Classification" in df.columns:
        dist = df["Classification"].dropna().astype(str).value_counts().reset_index()
        dist.columns = ["Classification", "Nombre"]
        st.plotly_chart(px.pie(dist, values="Nombre", names="Classification"), use_container_width=True)
with col2:
    if "DatePublication" in df.columns and "AN" in df.columns:
        trend = df.groupby("DatePublication")["AN"].sum().reset_index()
        st.plotly_chart(px.line(trend, x="DatePublication", y="AN"), use_container_width=True)
