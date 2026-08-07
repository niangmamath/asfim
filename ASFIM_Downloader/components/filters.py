import pandas as pd
import streamlit as st


def _ensure_state(key: str, default):
    if key not in st.session_state:
        st.session_state[key] = default


def render_global_filters(df: pd.DataFrame) -> pd.DataFrame:
    filtered_df = df.copy()

    if "DatePublication" in filtered_df.columns:
        dates = pd.to_datetime(filtered_df["DatePublication"], errors="coerce").dropna()
        if not dates.empty:
            min_date = dates.min().date()
            max_date = dates.max().date()
            _ensure_state("filter_start_date", min_date)
            _ensure_state("filter_end_date", max_date)
            start_date = st.sidebar.date_input(
                "Date de début",
                value=st.session_state["filter_start_date"],
                key="filter_start_date",
                min_value=min_date,
                max_value=max_date,
            )
            end_date = st.sidebar.date_input(
                "Date de fin",
                value=st.session_state["filter_end_date"],
                key="filter_end_date",
                min_value=min_date,
                max_value=max_date,
            )
            filtered_df = filtered_df[
                (filtered_df["DatePublication"].dt.date >= start_date) &
                (filtered_df["DatePublication"].dt.date <= end_date)
            ]

    for column, key in [
        ("Classification", "filter_classification"),
        ("Société de Gestion", "filter_societe"),
        ("TypePublication", "filter_type_publication"),
        ("Nature juridique", "filter_nature"),
        ("Souscripteurs", "filter_souscripteurs"),
        ("Indice Bentchmark", "filter_benchmark"),
    ]:
        if column in filtered_df.columns:
            options = sorted(filtered_df[column].dropna().astype(str).unique())
            _ensure_state(key, options)
            selected = st.sidebar.multiselect(column, options=options, default=st.session_state[key], key=key)
            if selected:
                filtered_df = filtered_df[filtered_df[column].astype(str).isin(selected)]

    st.sidebar.divider()
    st.sidebar.caption("Filtres globaux synchronisés sur toutes les pages.")
    return filtered_df
