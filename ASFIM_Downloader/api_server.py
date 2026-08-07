from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
import pandas as pd
import uvicorn
import subprocess
import os
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# AUTOMATISATION : Exécution du script sync.py
# ---------------------------------------------------------
def run_sync():
    print("Démarrage de la mise à jour automatique des données (sync.py)...")
    try:
        # On utilise sys.executable pour garantir qu'on utilise le même Python
        import sys
        subprocess.run([sys.executable, "sync.py"], check=True)
        print("Mise à jour terminée avec succès.")
    except Exception as e:
        print(f"Erreur lors de la mise à jour : {e}")

@app.on_event("startup")
def start_scheduler():
    scheduler = BackgroundScheduler()
    # Le script sync.py s'exécutera tous les jours à 00h00
    scheduler.add_job(run_sync, 'cron', hour=0, minute=0)
    scheduler.start()
    
    # --- LIGNE AJOUTÉE ICI ---
    # On force l'exécution de sync.py immédiatement au démarrage
    # pour que les données soient à jour dès que Render lance le serveur.
    run_sync()
# ---------------------------------------------------------

@app.get("/api/dashboard")
def get_dashboard(date: Optional[str] = "All", type_pub: Optional[str] = "All", classification: Optional[str] = "All"):
    # 1. Lecture des données (Forcé sur CSV avec nettoyage)
    # On vérifie si le fichier existe, sinon on force un sync
    if not os.path.exists("dashboard_data.csv"):
        run_sync()
        
    try:
        df = pd.read_csv("dashboard_data.csv", encoding="utf-8-sig")
    except Exception as e:
        print(f"Erreur lecture CSV: {e}")
        return {"error": "Impossible de lire les données"}

    df.columns = [str(col).strip() for col in df.columns]

    # Nettoyage vital des colonnes numériques pour que les sommes fonctionnent
    numeric_cols = ["AN", "VL", "YTD"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace("%", "", regex=False)
                .str.replace(",", ".", regex=False)
                .str.replace(" ", "", regex=False)
                .replace(["-", "", "nan", "None"], pd.NA)
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # 2. Détection intelligente des colonnes
    col_societe = next((c for c in df.columns if "soci" in c.lower() and "gestion" in c.lower()), "Société de gestion")
    col_classif = next((c for c in df.columns if "classif" in c.lower()), "Classification")
    col_date = next((c for c in df.columns if "date" in c.lower()), "DatePublication")
    col_type = next((c for c in df.columns if "type" in c.lower()), "TypePublication")

    # FORMATAGE STRICT DES DATES
    if col_date in df.columns:
        df[col_date] = pd.to_datetime(df[col_date], errors='coerce').dt.strftime('%Y-%m-%d')

    # 3. Créer des paires {date, type} pour le menu déroulant
    dates_dispo = []
    if col_date in df.columns and col_type in df.columns:
        df_dates = df[[col_date, col_type]].dropna().drop_duplicates().sort_values(col_date, ascending=False)
        for _, row in df_dates.iterrows():
            dates_dispo.append({"date": str(row[col_date]), "type": str(row[col_type])})

    types_dispo = sorted(df[col_type].astype(str).dropna().unique().tolist()) if col_type in df.columns else []
    classif_dispo = sorted(df[col_classif].astype(str).dropna().unique().tolist()) if col_classif in df.columns else []

    # 4. Appliquer les filtres demandés par l'interface web
    df_filtered = df.copy()
    if date != "All" and col_date in df_filtered.columns:
        df_filtered = df_filtered[df_filtered[col_date].astype(str).str.strip() == date.strip()]
    if type_pub != "All" and col_type in df_filtered.columns:
        df_filtered = df_filtered[df_filtered[col_type].astype(str).str.strip() == type_pub.strip()]
    if classification != "All" and col_classif in df_filtered.columns:
        df_filtered = df_filtered[df_filtered[col_classif].astype(str).str.strip() == classification.strip()]

    # 5. Calculer les vrais KPIs par Société de Gestion
    companies = []
    if not df_filtered.empty and col_societe in df_filtered.columns:
        grouped = df_filtered.groupby(col_societe)
        for name, group in grouped:
            assets = float(group["AN"].sum()) if "AN" in group.columns else 0.0
            vl_total = float(group["VL"].sum()) if "VL" in group.columns else 0.0
            funds_count = int(group["OPCVM"].nunique()) if "OPCVM" in group.columns else len(group)
            
            positives = 0
            perf_ytd = 0.0
            if "YTD" in group.columns:
                # Filtrage des valeurs valides pour la moyenne YTD
                ytd_group = group["YTD"].dropna()
                positives = int((ytd_group > 0).sum())
                if not ytd_group.empty:
                    perf_ytd = float(ytd_group.mean())

            classifications = group[col_classif].dropna().unique().tolist() if col_classif in group.columns else []

            companies.append({
                "id": str(name),
                "name": str(name),
                "assets": assets,
                "vlTotal": vl_total,
                "fundsCount": funds_count,
                "positiveFundsCount": positives,
                "classifications": classifications,
                "perf1Y": perf_ytd
            })
        
        companies = sorted(companies, key=lambda x: x["assets"], reverse=True)
        for i, c in enumerate(companies):
            c["rank"] = i + 1

    # 6. GÉNÉRATION DE LA HIÉRARCHIE POUR LE TREEMAP
    hierarchy = []
    if not df_filtered.empty and col_classif in df_filtered.columns and col_societe in df_filtered.columns:
        for classif, classif_group in df_filtered.groupby(col_classif):
            children = []
            for soc, soc_group in classif_group.groupby(col_societe):
                children.append({"name": str(soc), "size": float(soc_group["AN"].sum())})
            hierarchy.append({"name": str(classif), "children": children})

    return {
        "filters": {
            "dates": dates_dispo,
            "types": types_dispo,
            "classifications": classif_dispo
        },
        "companies": companies,
        "hierarchy": hierarchy 
    }

if __name__ == "__main__":
    # Render attribue un port dynamique. Si on est en local, on utilise 8000.
    port = int(os.environ.get("PORT", 8000))
    # 0.0.0.0 est obligatoire pour exposer l'API sur le web
    uvicorn.run(app, host="0.0.0.0", port=port)