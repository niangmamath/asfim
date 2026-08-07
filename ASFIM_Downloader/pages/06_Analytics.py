import pandas as pd
import plotly.express as px
import streamlit as st

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="Analytics", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("Analytics")
st.caption("Analyses avancées et visualisations de performance")

numeric_cols = [c for c in ["AN", "VL", "YTD", "1 jour", "1 semaine", "1 mois", "3 mois", "6 mois", "1 an", "2 ans", "3 ans", "5 ans"] if c in df.columns]

if len(numeric_cols) >= 2:
    sample = df[numeric_cols].dropna()
    if not sample.empty:
        fig = px.scatter(sample, x="AN", y="YTD", size="VL", color="YTD")
        st.plotly_chart(fig, use_container_width=True)

if "Classification" in df.columns and "YTD" in df.columns:
    box = px.box(df, x="Classification", y="YTD", points="outliers")
    st.plotly_chart(box, use_container_width=True)

if len(numeric_cols) >= 2:
    corr = df[numeric_cols].corr().round(2)
    fig_corr = px.imshow(corr, color_continuous_scale="Blues")
    st.plotly_chart(fig_corr, use_container_width=True)
