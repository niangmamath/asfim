import os
import traceback
from api import get_all_dates
from downloader import download_file
from parser import read_excel
from database import init_db, is_date_imported, save_data, export_for_powerbi

def main():
    print("=== PIPELINE DE SYNCHRONISATION ASFIM ===")
    
    init_db()
    
    print("Connexion à l'API ASFIM...")
    all_publications = get_all_dates()
    
    # --- NOUVELLE LOGIQUE : Isoler uniquement les plus récents ---
    latest_hebdo = None
    latest_quotidien = None
    
    for pub in all_publications:
        if pub["is_hebdo"] and latest_hebdo is None:
            latest_hebdo = pub
        elif not pub["is_hebdo"] and latest_quotidien is None:
            latest_quotidien = pub
            
        # Si on a trouvé les deux, on arrête de chercher
        if latest_hebdo and latest_quotidien:
            break
            
    # On rassemble les deux fichiers dans une liste
    pubs_to_process = [p for p in [latest_hebdo, latest_quotidien] if p is not None]
    
    print(f"Cibles trouvées :")
    if latest_hebdo: print(f" - Dernier Hebdo : {latest_hebdo['date']}")
    if latest_quotidien: print(f" - Dernier Quotidien : {latest_quotidien['date']}")
    
    new_imports = 0
    
    # --- TRAITEMENT DES 2 FICHIERS ---
    for pub in pubs_to_process:
        date = pub["date"]
        is_hebdo = pub["is_hebdo"]
        
        if is_date_imported(date):
            print(f"✅ Déjà en base : {date} ({'Hebdo' if is_hebdo else 'Quotidienne'})")
            continue 
            
        print(f"\n🆕 Nouveau fichier à traiter : {date} ({'Hebdo' if is_hebdo else 'Quotidienne'})")
        
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