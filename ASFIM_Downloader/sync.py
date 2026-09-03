import os
import traceback
from api import get_all_dates
from downloader import download_file
from parser import read_excel
from database import init_db, is_date_imported, save_data, export_for_powerbi

MAX_BACKFILL = 90  # sécurité : ne jamais rattraper plus de N publications manquantes en un seul run

def main():
    print("=== PIPELINE DE SYNCHRONISATION ASFIM ===")

    init_db()

    print("Connexion à l'API ASFIM...")
    all_publications = get_all_dates()  # trié par date décroissante

    # --- Repérer TOUTES les publications non encore importées (pas seulement la plus récente) ---
    missing = [p for p in all_publications if not is_date_imported(p["date"])]

    if not missing:
        print("\n✅ Tout est déjà à jour. Aucune nouvelle publication à traiter.")
        if not os.path.exists("asfim_historique_bi.csv"):
            export_for_powerbi()
        if not os.path.exists("dashboard_data.parquet"):
            print("\n⚙️  Création des datasets manquants pour le Dashboard Web...")
            os.system("python prepare_dashboard.py")
        return

    if len(missing) > MAX_BACKFILL:
        print(f"⚠️ {len(missing)} publications manquantes détectées, "
              f"au-delà de la limite de sécurité ({MAX_BACKFILL}). "
              f"Seules les {MAX_BACKFILL} plus récentes seront rattrapées.")
        missing = missing[:MAX_BACKFILL]

    print(f"🆕 {len(missing)} publication(s) à rattraper : "
          f"{', '.join(p['date'] for p in reversed(missing))}")

    new_imports = 0

    # --- TRAITEMENT DE TOUTES LES DATES MANQUANTES (de la plus ancienne à la plus récente) ---
    for pub in reversed(missing):
        date = pub["date"]
        is_hebdo = pub["is_hebdo"]

        print(f"\n🆕 Traitement : {date} ({'Hebdo' if is_hebdo else 'Quotidienne'})")

        try:
            download_file(date)
            from config import DOWNLOAD_FOLDER

            file_path = DOWNLOAD_FOLDER / f"{date}.xlsx"
            
            if not os.path.exists(file_path):
                print(f"⚠️ Fichier {date}.xlsx introuvable après téléchargement.")
                continue
                
            df = read_excel(file_path, date, is_hebdo)
            save_data(df, date, is_hebdo)
            new_imports += 1
            
        except Exception as e:
            print(f"❌ Erreur lors du traitement de la date {date}: {e}")
            traceback.print_exc()
            continue

    # --- EXPORT FINAL POUR POWER BI ---
    # --- EXPORT FINAL POUR POWER BI ET WEB ---
    if new_imports > 0:
        print(f"\n🚀 Synchronisation réussie. {new_imports} nouvelle(s) date(s) ajoutée(s).")
        export_for_powerbi()
        
        # Lancement automatique de la préparation pour le Web
        print("\n⚙️  Mise à jour des datasets pour le Dashboard Web...")
        os.system("python prepare_dashboard.py")
        
    else:
        print("\n✅ Tout est déjà à jour pour les données les plus récentes.")
        if not os.path.exists("asfim_historique_bi.csv"):
            export_for_powerbi()
        if not os.path.exists("dashboard_data.parquet"):
            print("\n⚙️  Création des datasets manquants pour le Dashboard Web...")
            os.system("python prepare_dashboard.py")

if __name__ == "__main__":
    main()