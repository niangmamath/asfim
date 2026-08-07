import plotly.express as px
import streamlit as st

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="Comparateur", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("Comparateur")
st.caption("Comparer plusieurs OPCVM, sociétés ou classifications")

if "OPCVM" in df.columns:
    selected_funds = st.multiselect("Sélectionner des OPCVM", sorted(df["OPCVM"].dropna().astype(str).unique()))
    if selected_funds:
        comp_df = df[df["OPCVM"].astype(str).isin(selected_funds)]
        fig = px.bar(comp_df, x="OPCVM", y="YTD", color="OPCVM", text="YTD")
        st.plotly_chart(fig, use_container_width=True)

if "Société de Gestion" in df.columns:
    selected_managers = st.multiselect("Sélectionner des sociétés", sorted(df["Société de Gestion"].dropna().astype(str).unique()))
    if selected_managers:
        manager_df = df[df["Société de Gestion"].astype(str).isin(selected_managers)]
        summary = manager_df.groupby("Société de Gestion").agg(AN=("AN", "sum"), YTD=("YTD", "mean"), OPCVM=("OPCVM", "nunique")).reset_index()
        st.plotly_chart(px.bar(summary, x="Société de Gestion", y="YTD", color="Société de Gestion"), use_container_width=True)
