import streamlit as st
import pandas as pd
from io import BytesIO

from utils.data_loader import load_dashboard_data
from components.filters import render_global_filters

st.set_page_config(page_title="Export", layout="wide")

df = load_dashboard_data()
df = render_global_filters(df)

st.title("Export")
st.caption("Exporter les données filtrées en différents formats")

if st.button("Exporter en CSV"):
    csv = df.to_csv(index=False, encoding="utf-8-sig").encode("utf-8")
    st.download_button("Télécharger CSV", csv, file_name="asfim_export.csv", mime="text/csv")

if st.button("Exporter en Excel"):
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="data")
    st.download_button("Télécharger Excel", output.getvalue(), file_name="asfim_export.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

st.dataframe(df, use_container_width=True, hide_index=True)
