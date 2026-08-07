import pandas as pd
import streamlit as st

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="OPCVM Explorer", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("OPCVM Explorer")
st.caption("Recherche instantanée et exploration détaillée des fonds")

search = st.text_input("Rechercher par nom, ISIN ou code")
if search:
    mask = df.astype(str).apply(lambda col: col.str.contains(search, case=False, na=False)).any(axis=1)
    df = df[mask]

columns = [
    "OPCVM",
    "CODE ISIN",
    "Code Maroclear",
    "Classification",
    "Société de Gestion",
    "Nature juridique",
    "Souscripteurs",
    "Périodicité VL",
    "TypePublication",
    "AN",
    "VL",
    "YTD",
    "1 an",
]
visible_cols = [col for col in columns if col in df.columns]
st.dataframe(df[visible_cols], use_container_width=True, hide_index=True)
