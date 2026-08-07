import plotly.express as px
import streamlit as st

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="Asset Managers", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("Asset Managers")
st.caption("Performance et structure par société de gestion")

if "Société de Gestion" in df.columns:
    managers = df.groupby("Société de Gestion").agg(
        Nombre_OPCVM=("OPCVM", "nunique"),
        AN=("AN", "sum"),
        VL=("VL", "sum"),
        Performance_moyenne=("YTD", "mean"),
    ).reset_index()
    managers = managers.sort_values("AN", ascending=False)
    st.dataframe(managers, use_container_width=True, hide_index=True)

    if not managers.empty:
        selected_manager = st.selectbox("Sélectionner une société", managers["Société de Gestion"].tolist())
        manager_df = df[df["Société de Gestion"].astype(str) == selected_manager]
        st.subheader(selected_manager)
        cols = st.columns(3)
        cols[0].metric("Nombre OPCVM", manager_df["OPCVM"].nunique())
        cols[1].metric("AN", f"{manager_df['AN'].sum():,.0f} MAD")
        cols[2].metric("Performance moyenne YTD", f"{manager_df['YTD'].mean():.2f}%")
        st.plotly_chart(px.bar(manager_df.sort_values("YTD", ascending=False).head(10), x="OPCVM", y="YTD", color="YTD"), use_container_width=True)
