import pandas as pd
import os

# Fichiers sources et cibles
source_file = "exports/asfim_historique_bi.csv" # <-- C'EST LUI LE VRAI FICHIER À JOUR
csv_file = "dashboard_data.csv"
parquet_file = "dashboard_data.parquet"

print("Lecture du fichier historique à jour...")

# On remplace SQLite par la lecture du CSV généré par sync.py
try:
    df = pd.read_csv(source_file)
    print(f"{len(df)} lignes chargées depuis {source_file}.")
except FileNotFoundError:
    print(f"❌ Erreur : Le fichier {source_file} est introuvable. Lance sync.py d'abord.")
    exit()

# Nettoyage de base
df.columns = df.columns.str.strip()

# --- Conversion Date ---
df["DatePublication"] = pd.to_datetime(df["DatePublication"], errors='coerce')

# Calcul des dates maximales PAR TYPE dans la nouvelle base
new_max_dates = df.groupby("TypePublication")["DatePublication"].max()

print("\n--- ANALYSE DES DATES (Fichier CSV) ---")
for pub_type, max_date in new_max_dates.items():
    print(f"Type: {pub_type} | Date la plus récente : {max_date.strftime('%Y-%m-%d') if pd.notna(max_date) else 'N/A'}")
print("-------------------------------------------\n")

# ======================================================
# VÉRIFICATION INTELLIGENTE PAR TYPE : Faut-il mettre à jour ?
# ======================================================
needs_update = True

if os.path.exists(parquet_file):
    try:
        df_existing = pd.read_parquet(parquet_file)
        df_existing["DatePublication"] = pd.to_datetime(df_existing["DatePublication"], errors='coerce')
        existing_max_dates = df_existing.groupby("TypePublication")["DatePublication"].max()
        
        needs_update = False 
        
        for pub_type, new_date in new_max_dates.items():
            if pub_type in existing_max_dates:
                existing_date = existing_max_dates[pub_type]
                if pd.notna(new_date) and (pd.isna(existing_date) or new_date > existing_date):
                    needs_update = True
                    print(f"🔄 Mise à jour nécessaire : Nouveau fichier '{pub_type}' détecté ({new_date.strftime('%Y-%m-%d')} > {existing_date.strftime('%Y-%m-%d')})")
            else:
                needs_update = True
                print(f"🔄 Mise à jour nécessaire : Nouveau type de publication détecté ('{pub_type}')")

        if not needs_update:
            print("✅ Le Dashboard est DÉJÀ à jour pour TOUS les types de publication (Hebdo & Quotidien).")
            print("⏭️ Création de fichiers ignorée pour optimiser les performances.")

    except Exception as e:
        print(f"⚠️ Impossible de lire l'ancien fichier ({e}). On force la mise à jour.")
        needs_update = True

# ======================================================
# TRAITEMENT & EXPORT (Seulement si nécessaire)
# ======================================================
if needs_update:
    print("\n⚙️ Préparation des données en cours...")
    
    numeric_cols = ["Commission de souscription", "Commission de rachat", "Frais de gestion", "AN", "VL", "YTD", "1 jour", "1 semaine", "1 mois", "3 mois", "6 mois", "1 an", "2 ans", "3 ans", "5 ans"]

    for col in numeric_cols:
        if col in df.columns:
            df[col] = (df[col].astype(str).str.replace("%", "").str.replace(",", ".").str.replace(" ", "").replace(["-", "", "nan", "None"], pd.NA))
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Colonnes calculées
    df["VL_Million"] = df["VL"] / 1_000_000
    df["AN_Million"] = df["AN"] / 1_000_000
    df["PerformancePositive"] = df["YTD"] > 0

    # Tri et nettoyage des doublons
    df = df.drop_duplicates().sort_values(["DatePublication", "TypePublication", "OPCVM"], ascending=[False, True, True])

    # Remplacement forcé (Anti-Verrouillage)
    import time
    for file in [csv_file, parquet_file]:
        if os.path.exists(file):
            try:
                os.remove(file)
            except PermissionError:
                print(f"⚠️ Attention : {file} est verrouillé. Tentative d'écrasement...")

    # Export
    df.to_csv(csv_file, index=False, encoding="utf-8-sig")
    df.to_parquet(parquet_file, index=False)

    print("\n=========================================================")
    print("🚀 Dataset Dashboard mis à jour et généré avec succès !")
    print("=========================================================\n")
    